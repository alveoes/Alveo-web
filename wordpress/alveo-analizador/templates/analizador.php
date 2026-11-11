<?php
/**
 * Plantilla del analizador.
 * Variables: $wa, $admin_notes, $is_admin, $posted_url, $server_out.
 *
 * Funciona con y sin JavaScript: el formulario se envía por POST a esta misma
 * página; si JavaScript está activo, intercepta el envío y usa admin-ajax.php.
 *
 * @package alveo-analizador
 */

defined( 'ABSPATH' ) || exit;

$alveo_has_results = $server_out && $server_out['ok'];
$alveo_error       = $server_out && ! $server_out['ok'] ? $server_out['message'] : '';
?>
<div class="alveo-an" id="alveo-analizador" data-ajax="<?php echo esc_url( admin_url( 'admin-ajax.php' ) ); ?>" data-whatsapp="<?php echo esc_attr( $wa ); ?>">

	<?php if ( $is_admin ) : ?>
		<div class="alveo-an-admin" role="note">
			<strong>Comprobaciones (solo lo ves tú, como administrador):</strong>
			<ul>
				<li class="alveo-an-jscheck">JavaScript del analizador: <b>no se ha ejecutado</b>. El analizador seguirá funcionando enviando el formulario al servidor, pero revisa las opciones de optimización de JavaScript (LiteSpeed Cache) si quieres resultados sin recargar la página.</li>
				<?php foreach ( $admin_notes as $note ) : ?><li><?php echo esc_html( $note ); ?></li><?php endforeach; ?>
				<?php if ( ! $admin_notes ) : ?><li>Servidor: cURL, DOM y conexión con otras webs funcionan correctamente.</li><?php endif; ?>
			</ul>
		</div>
	<?php endif; ?>

	<section class="alveo-an-hero">
		<div class="alveo-an-shell">
			<p class="alveo-an-kicker">ALVEO / Herramienta gratuita</p>
			<h2 class="alveo-an-display">Analiza tu web <em>gratis.</em></h2>
			<p class="alveo-an-lead">Escribe la dirección de tu negocio y te diremos las 3 mejoras más importantes para conseguir más clientes desde tu web. Explicadas sin tecnicismos.</p>

			<form class="alveo-an-form" method="post" action="#alveo-analizador" novalidate>
				<label class="alveo-an-label" for="alveo-an-url">Dirección de tu web</label>
				<div class="alveo-an-row">
					<input id="alveo-an-url" class="alveo-an-input" name="alveo_an_url" type="text" inputmode="url" autocomplete="url" autocapitalize="off" spellcheck="false" placeholder="www.tunegocio.es" maxlength="2048" required value="<?php echo esc_attr( $posted_url ); ?>">
					<button class="alveo-an-btn alveo-an-btn-dark" type="submit">Analizar mi web gratis <span aria-hidden="true">↗</span></button>
				</div>
				<p class="alveo-an-error" role="alert"<?php echo $alveo_error ? '' : ' hidden'; ?>><?php echo esc_html( $alveo_error ); ?></p>
			</form>
			<ul class="alveo-an-trust">
				<li>Sin registro</li><li>Sin contraseñas ni accesos</li><li>Solo datos públicos de tu web</li>
			</ul>

			<div class="alveo-an-loading" hidden aria-live="polite">
				<span class="alveo-an-spinner" aria-hidden="true"></span>
				<div>
					<p class="alveo-an-loading-title">Analizando tu web…</p>
					<p class="alveo-an-loading-copy">Abrimos tu página como lo haría un cliente y revisamos su código. Suele tardar unos segundos.</p>
				</div>
			</div>
		</div>
	</section>

	<div class="alveo-an-results"<?php echo $alveo_has_results ? '' : ' hidden'; ?>><?php
		echo $alveo_has_results ? $server_out['html'] : ''; // phpcs:ignore WordPress.Security.EscapeOutput -- HTML escapado en resultados.php.
	?></div>
</div>
