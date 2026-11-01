#!/usr/bin/env bash
# Configura Google Cloud para el analizador de ALVEO. Pensado para ejecutarse en Google Cloud Shell
# (ya autenticado con tu cuenta), así ninguna credencial pasa por el chat.
#
#   bash configurar-google.sh [ID_DEL_PROYECTO]
#
# Sin argumento usa el proyecto seleccionado en Cloud Shell.
# Hace, en este orden:
#   1. Comprueba que el proyecto tiene facturación vinculada.
#   2. Activa Places API (New), API Keys API, Billing Budgets API y Cloud Quotas API.
#   3. Crea (o reutiliza) una clave de API restringida SOLO a Places API (New).
#   4. Intenta fijar cuotas diarias bajas para Text Search y Place Details (tope de coste en Google).
#   5. Crea una alerta de presupuesto mensual (avisa por correo; no corta el gasto por sí sola).
#   6. Prueba la clave con una búsqueda que solo pide el identificador del lugar.
# Es idempotente: puedes volver a ejecutarlo.

set -uo pipefail
NOMBRE_CLAVE="alveo-analizador-servidor"
PRESUPUESTO="${PRESUPUESTO:-10}"        # importe mensual de la alerta, en la moneda de la cuenta de facturación
CUOTA_DIARIA="${CUOTA_DIARIA:-60}"      # peticiones al día por método (el servidor ya limita a 30 análisis/día)

ok()  { printf '\n\033[1;32m✔ %s\033[0m\n' "$*"; }
av()  { printf '\n\033[1;33m⚠ %s\033[0m\n' "$*"; }
err() { printf '\n\033[1;31m✘ %s\033[0m\n' "$*"; exit 1; }

PROYECTO="${1:-}"
# Sin argumento: el proyecto seleccionado en Cloud Shell; si no hay, uno llamado ALVEO o alveo-analizador.
[ -z "$PROYECTO" ] && PROYECTO="${DEVSHELL_PROJECT_ID:-$(gcloud config get-value project 2>/dev/null)}"
if [ -z "$PROYECTO" ]; then
  PROYECTO="$(gcloud projects list --filter='name:ALVEO OR name:alveo-analizador' --format='value(projectId)' | head -1)"
fi
[ -n "$PROYECTO" ] || err "No encuentro el proyecto. Ejecuta: bash configurar-google.sh ID_DEL_PROYECTO"
gcloud config set project "$PROYECTO" >/dev/null 2>&1
ok "Proyecto: $PROYECTO"

# 1. Facturación
CUENTA="$(gcloud billing projects describe "$PROYECTO" --format='value(billingAccountName)' 2>/dev/null)"
ACTIVA="$(gcloud billing projects describe "$PROYECTO" --format='value(billingEnabled)' 2>/dev/null)"
if [ -z "$CUENTA" ] || [ "$ACTIVA" != "True" ]; then
  err "El proyecto no tiene una cuenta de facturación activa. Vincúlala en https://console.cloud.google.com/billing/linkedaccount?project=$PROYECTO y vuelve a ejecutar el script."
fi
CUENTA_ID="${CUENTA#billingAccounts/}"
ok "Facturación activa ($CUENTA_ID)"

# 2. APIs
gcloud services enable places.googleapis.com apikeys.googleapis.com billingbudgets.googleapis.com cloudquotas.googleapis.com \
  || err "No se pudieron activar las APIs."
ok "APIs activadas"

# 3. Clave restringida
NOMBRE="$(gcloud services api-keys list --filter="displayName=$NOMBRE_CLAVE" --format='value(name)' | head -1)"
if [ -z "$NOMBRE" ]; then
  gcloud services api-keys create --display-name="$NOMBRE_CLAVE" --api-target=service=places.googleapis.com >/dev/null 2>&1 \
    || err "No se pudo crear la clave."
  NOMBRE="$(gcloud services api-keys list --filter="displayName=$NOMBRE_CLAVE" --format='value(name)' | head -1)"
  ok "Clave creada y restringida a Places API (New)"
else
  gcloud services api-keys update "$NOMBRE" --api-target=service=places.googleapis.com >/dev/null 2>&1
  ok "Clave existente reutilizada y restringida a Places API (New)"
fi
CLAVE="$(gcloud services api-keys get-key-string "$NOMBRE" --format='value(keyString)')"
[ -n "$CLAVE" ] || err "No se pudo leer la clave."

# 4. Cuotas diarias (mejor esfuerzo: los identificadores de cuota los define Google)
CUOTAS="$(gcloud beta quotas info list --service=places.googleapis.com --project="$PROYECTO" --format='value(quotaId)' 2>/dev/null | grep -iE 'per.?day' | grep -iE 'searchtext|search_text|getplace|get_place|placedetails|place_details' || true)"
if [ -z "$CUOTAS" ]; then
  av "No he encontrado cuotas diarias ajustables para Places API. El servidor mantiene su propio tope (GOOGLE_DAILY_BUDGET). Puedes revisarlas en https://console.cloud.google.com/apis/api/places.googleapis.com/quotas?project=$PROYECTO"
else
  for Q in $CUOTAS; do
    PID="alveo-$(echo "$Q" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9-' '-' | cut -c1-50)"
    if gcloud beta quotas preferences create --service=places.googleapis.com --project="$PROYECTO" --quota-id="$Q" \
         --preferred-value="$CUOTA_DIARIA" --preference-id="$PID" --justification="Tope de coste del analizador de ALVEO" >/dev/null 2>&1 \
       || gcloud beta quotas preferences update "$PID" --service=places.googleapis.com --project="$PROYECTO" --quota-id="$Q" \
         --preferred-value="$CUOTA_DIARIA" --allow-missing >/dev/null 2>&1; then
      ok "Cuota $Q fijada en $CUOTA_DIARIA al día"
    else
      av "No se pudo fijar la cuota $Q (puedes ajustarla a mano en la consola)."
    fi
  done
fi

# 5. Alerta de presupuesto
if gcloud billing budgets list --billing-account="$CUENTA_ID" --format='value(displayName)' 2>/dev/null | grep -qx "alveo-analizador"; then
  ok "La alerta de presupuesto ya existía"
else
  CREADA=""
  for IMPORTE in "${PRESUPUESTO}EUR" "${PRESUPUESTO}USD" "$PRESUPUESTO"; do
    if gcloud billing budgets create --billing-account="$CUENTA_ID" --display-name="alveo-analizador" \
         --budget-amount="$IMPORTE" --filter-projects="projects/$PROYECTO" \
         --threshold-rule=percent=0.5 --threshold-rule=percent=0.9 --threshold-rule=percent=1.0 >/dev/null 2>&1; then
      CREADA="$IMPORTE"; break
    fi
  done
  if [ -n "$CREADA" ]; then ok "Alerta de presupuesto creada: $CREADA al mes (avisos al 50 %, 90 % y 100 %)"
  else av "No se pudo crear la alerta de presupuesto (puede requerir permiso de administrador de facturación)."; fi
fi

# 6. Prueba de la clave (campo places.id: solo identificadores)
printf '\nProbando la clave (puede tardar unos minutos en activarse)…'
for i in 1 2 3 4 5 6; do
  CODIGO="$(curl -s -o /tmp/alveo-prueba.json -w '%{http_code}' -X POST 'https://places.googleapis.com/v1/places:searchText' \
    -H 'Content-Type: application/json' -H "X-Goog-Api-Key: $CLAVE" -H 'X-Goog-FieldMask: places.id' \
    -d '{"textQuery":"Alhambra, Granada","languageCode":"es","regionCode":"ES"}')"
  [ "$CODIGO" = "200" ] && break
  printf '.'; sleep 20
done
if [ "$CODIGO" = "200" ]; then ok "La clave funciona"; else av "La clave aún responde $CODIGO. Espera unos minutos; no hace falta repetir el script."; fi

cat <<FIN

────────────────────────────────────────────────────────────────
Clave para el servidor (variable GOOGLE_PLACES_API_KEY):

  $CLAVE

Guárdala SOLO como secreto/variable de entorno del servidor.
No la pegues en el chat ni en el código.
────────────────────────────────────────────────────────────────
FIN
