<?php
/**
 * Análisis del HTML real de una página. Cada resultado incluye lo que se ha
 * encontrado en el código («evidencia»), para que sea comprobable.
 * No se calcula ninguna puntuación: solo se detectan problemas concretos.
 */

defined( 'ABSPATH' ) || exit;

class Alveo_Analizador_Analyzer {

	/** @var DOMXPath */
	private $xp;
	private $page;
	private $text = '';
	private $checks = array();

	const SKIP = 'ancestor::script or ancestor::style or ancestor::noscript or ancestor::template or ancestor::svg or ancestor::iframe';

	public function __construct( array $page ) {
		$this->page = $page;
		$doc        = new DOMDocument();
		libxml_use_internal_errors( true );
		$doc->loadHTML( '<?xml encoding="UTF-8">' . $page['html'], LIBXML_NONET | LIBXML_COMPACT );
		libxml_clear_errors();
		$this->xp   = new DOMXPath( $doc );
		$this->text = $this->text_of( $this->xp->query( '//body' )->item( 0 ) );
	}

	/* ------------------------------------------------------------ utilidades */

	private function q( $xpath, $ctx = null ) {
		$r = $ctx ? $this->xp->query( $xpath, $ctx ) : $this->xp->query( $xpath );
		return $r ? iterator_to_array( $r ) : array();
	}

	/** Texto visible de un nodo (sin scripts ni estilos), con espacios entre bloques. */
	private function text_of( $node ) {
		if ( ! $node ) {
			return '';
		}
		$parts = array();
		foreach ( $this->q( './/text()[not(' . self::SKIP . ')]', $node ) as $t ) {
			$parts[] = $t->nodeValue;
		}
		return self::clean( implode( ' ', $parts ) );
	}

	private static function clean( $s ) {
		return trim( preg_replace( '/\s+/u', ' ', (string) $s ) );
	}

	private static function words( $s ) {
		return array_values( array_filter( preg_split( '/\s+/u', $s ), function ( $w ) {
			return (bool) preg_match( '/\p{L}/u', $w );
		} ) );
	}

	private static function quote( $s, $max = 80 ) {
		return '«' . ( mb_strlen( $s ) > $max ? mb_substr( $s, 0, $max - 1 ) . '…' : $s ) . '»';
	}

	private static function kb( $bytes ) {
		return $bytes < 1024 ? $bytes . ' B' : round( $bytes / 1024 ) . ' KB';
	}

	private static function secs( $ms ) {
		return $ms < 1000 ? $ms . ' ms' : str_replace( '.', ',', sprintf( '%.1f', $ms / 1000 ) ) . ' s';
	}

	private function meta( $attr, $name ) {
		foreach ( $this->q( '//meta[@' . $attr . ']' ) as $m ) {
			if ( strtolower( $m->getAttribute( $attr ) ) === $name ) {
				return self::clean( $m->getAttribute( 'content' ) );
			}
		}
		return null;
	}

	/**
	 * Registra una comprobación.
	 * $fix = [ prioridad 1-10, título, explicación sencilla ] (solo si hay problema).
	 */
	private function add( $area, $label, $status, $evidence, $fix = null ) {
		$this->checks[] = compact( 'area', 'label', 'status', 'evidence', 'fix' );
	}

	/* ---------------------------------------------------------------- análisis */

	public function run() {
		$words      = count( self::words( $this->text ) );
		$scripts    = count( $this->q( '//script[@src]' ) );
		$app_root   = count( $this->q( '//*[@id="root" or @id="app" or @id="__next" or @id="__nuxt"]' ) );
		$js_render  = $words < 80 && ( $scripts > 0 || $app_root > 0 );

		$this->mobile();
		$this->speed();
		$this->seo();
		if ( ! $js_render ) {
			$this->content( $words );
			$this->contact();
		}

		// Las mejoras salen solo de problemas detectados; máx. 2 por área.
		$problems = array_filter( $this->checks, function ( $c ) {
			return $c['fix'] && in_array( $c['status'], array( 'fail', 'warn' ), true );
		} );
		usort( $problems, function ( $a, $b ) {
			$sa = $a['fix'][0] + ( 'fail' === $a['status'] ? 3 : 0 );
			$sb = $b['fix'][0] + ( 'fail' === $b['status'] ? 3 : 0 );
			return $sb <=> $sa;
		} );
		$picked = array();
		$per    = array();
		foreach ( $problems as $p ) {
			if ( count( $picked ) >= 3 ) {
				break;
			}
			$per[ $p['area'] ] = isset( $per[ $p['area'] ] ) ? $per[ $p['area'] ] + 1 : 1;
			if ( $per[ $p['area'] ] <= 2 ) {
				$picked[] = $p;
			}
		}
		foreach ( $problems as $p ) {
			if ( count( $picked ) >= 3 ) {
				break;
			}
			if ( ! in_array( $p, $picked, true ) ) {
				$picked[] = $p;
			}
		}

		$strengths = array();
		foreach ( $this->checks as $c ) {
			if ( 'pass' === $c['status'] ) {
				$strengths[] = array( 'area' => $c['area'], 'label' => $c['label'], 'evidence' => $c['evidence'] );
			}
		}

		$notices = array();
		if ( $js_render ) {
			$notices[] = 'Esta web genera su contenido con JavaScript, así que no hemos podido revisar sus textos ni sus formas de contacto. El resto del análisis sí es válido.';
		}

		return array(
			'improvements' => array_map( function ( $p ) {
				return array(
					'area'     => $p['area'],
					'title'    => $p['fix'][1],
					'text'     => $p['fix'][2],
					'evidence' => $p['evidence'],
				);
			}, $picked ),
			'strengths'    => $strengths,
			'checked'      => count( $this->checks ),
			'notices'      => $notices,
		);
	}

	/* ------------------------------------------------------------------ móvil */

	private function mobile() {
		$vp = $this->meta( 'name', 'viewport' );
		if ( null === $vp ) {
			$this->add( 'Móvil', 'Adaptada al móvil', 'fail', 'No tiene la etiqueta «viewport» que indica a los móviles cómo mostrar la página.', array(
				10, 'Haz que tu web se vea bien en el móvil',
				'Tu web no indica a los móviles cómo adaptarse a la pantalla, así que se ve diminuta y obliga a hacer zoom. La mayoría de tus clientes te visita desde el móvil: es lo primero que conviene arreglar.',
			) );
			return;
		}
		$vpl = strtolower( $vp );
		if ( false === strpos( $vpl, 'width=device-width' ) ) {
			$this->add( 'Móvil', 'Adaptada al móvil', 'warn', 'La configuración para móviles está incompleta: ' . self::quote( $vp ) . '.', array(
				8, 'Ajusta tu web al ancho de los móviles',
				'Tu web tiene una configuración para móviles incompleta y puede no ocupar bien la pantalla. Es un cambio pequeño que mejora mucho la experiencia.',
			) );
		} else {
			$this->add( 'Móvil', 'Adaptada al móvil', 'pass', 'Tiene la configuración para móviles correcta.' );
		}
		if ( preg_match( '/user-scalable\s*=\s*(no|0)/', $vpl ) || ( preg_match( '/maximum-scale\s*=\s*([\d.]+)/', $vpl, $m ) && (float) $m[1] < 2 ) ) {
			$this->add( 'Móvil', 'Permite ampliar el texto', 'warn', 'La web impide hacer zoom en el móvil.', array(
				4, 'Deja que tus visitantes puedan ampliar la web',
				'Tu web bloquea el zoom en el móvil. Muchas personas lo necesitan para leer precios, horarios o direcciones. Quitar ese bloqueo es sencillo.',
			) );
		}
	}

	/* -------------------------------------------------------------- velocidad */

	private function speed() {
		$t = (int) $this->page['ttfb_ms'];
		if ( $t >= 800 ) {
			$this->add( 'Velocidad', 'Respuesta rápida del servidor', $t >= 1800 ? 'fail' : 'warn', 'El servidor tardó ' . self::secs( $t ) . ' en empezar a responder.', array(
				$t >= 1800 ? 7 : 4, 'Reduce la espera inicial de tu web',
				'Tu servidor tarda ' . self::secs( $t ) . ' en empezar a enviar la página, antes de que se vea nada. Cada segundo de espera hace que algunas personas se vayan. Suele mejorar con caché o un alojamiento más rápido.',
			) );
		} else {
			$this->add( 'Velocidad', 'Respuesta rápida del servidor', 'pass', 'El servidor respondió en ' . self::secs( $t ) . '.' );
		}

		$bytes = (int) $this->page['html_bytes'];
		$enc   = isset( $this->page['headers']['content-encoding'] ) ? strtolower( $this->page['headers']['content-encoding'] ) : '';
		if ( $bytes > 10240 ) {
			if ( '' === $enc || 'identity' === $enc ) {
				$this->add( 'Velocidad', 'Compresión activada', 'warn', 'La página (' . self::kb( $bytes ) . ') se envía sin comprimir.', array(
					4, 'Activa la compresión en tu alojamiento',
					'Tu web se envía sin comprimir, lo que la hace más pesada de lo necesario. Se activa en la configuración del alojamiento o con un plugin de caché y no cambia nada de lo que se ve.',
				) );
			} else {
				$this->add( 'Velocidad', 'Compresión activada', 'pass', 'La página se envía comprimida (' . $enc . ').' );
			}
		}
		if ( $bytes > 307200 ) {
			$this->add( 'Velocidad', 'Código ligero', $bytes > 1048576 ? 'fail' : 'warn', 'El código de la página pesa ' . self::kb( $bytes ) . ' (sin contar imágenes).', array(
				3, 'Aligera el código de tu web',
				'El código de tu página pesa ' . self::kb( $bytes ) . ', bastante más de lo habitual. Suele deberse a plantillas o complementos que cargan cosas que no se usan.',
			) );
		}

		$imgs = $this->q( '//img' );
		if ( count( $imgs ) > 6 ) {
			$lazy = 0;
			foreach ( $imgs as $i ) {
				if ( 'lazy' === strtolower( $i->getAttribute( 'loading' ) ) || $i->hasAttribute( 'data-src' ) || $i->hasAttribute( 'data-lazy-src' ) ) {
					$lazy++;
				}
			}
			if ( 0 === $lazy ) {
				$this->add( 'Velocidad', 'Imágenes con carga diferida', 'warn', 'Hay ' . count( $imgs ) . ' imágenes y todas se descargan al entrar.', array(
					4, 'Carga las imágenes solo cuando se vean',
					'Tu página tiene ' . count( $imgs ) . ' imágenes y todas se descargan nada más entrar, aunque estén al final. Cargarlas a medida que se baja acelera la primera impresión.',
				) );
			} else {
				$this->add( 'Velocidad', 'Imágenes con carga diferida', 'pass', $lazy . ' de ' . count( $imgs ) . ' imágenes se cargan solo cuando hacen falta.' );
			}
		}

		$r = (int) $this->page['redirects'];
		if ( $r > 1 ) {
			$this->add( 'Velocidad', 'Sin saltos innecesarios', 'warn', 'Hay ' . $r . ' redirecciones antes de llegar a la página.', array(
				3, 'Elimina saltos innecesarios',
				'Al escribir tu dirección, la web salta ' . $r . ' veces antes de cargar. Cada salto añade espera; lo ideal es uno como máximo.',
			) );
		}
	}

	/* -------------------------------------------------------------------- SEO */

	private function seo() {
		if ( 0 === strpos( $this->page['final_url'], 'https://' ) ) {
			$this->add( 'Google', 'Conexión segura (HTTPS)', 'pass', 'La web usa HTTPS.' );
		} else {
			$this->add( 'Google', 'Conexión segura (HTTPS)', 'fail', 'La web se abre sin HTTPS y el navegador la marca como «No segura».', array(
				9, 'Activa la conexión segura (HTTPS)',
				'Chrome muestra tu web como «No segura». Eso genera desconfianza y Google la favorece menos. La mayoría de alojamientos ofrecen el certificado gratis.',
			) );
		}

		$robots   = strtolower( (string) $this->meta( 'name', 'robots' ) . ' ' . (string) $this->meta( 'name', 'googlebot' ) );
		$x_robots = isset( $this->page['headers']['x-robots-tag'] ) ? strtolower( $this->page['headers']['x-robots-tag'] ) : '';
		if ( preg_match( '/noindex|\bnone\b/', $robots . ' ' . $x_robots ) ) {
			$this->add( 'Google', 'Visible en Google', 'fail', 'La página pide a Google que no la muestre («noindex»).', array(
				10, 'Permite que Google muestre tu web',
				'Tu web le dice a Google que no la incluya en sus resultados, así que no te encontrarán al buscarte. A menudo es un ajuste que se quedó activado tras construir la web (en WordPress: Ajustes → Lectura).',
			) );
		} else {
			$this->add( 'Google', 'Visible en Google', 'pass', 'No hay ninguna instrucción que impida aparecer en Google.' );
		}

		$titles = $this->q( '//title' );
		$title  = $titles ? self::clean( $titles[0]->textContent ) : '';
		$len    = mb_strlen( $title );
		if ( '' === $title ) {
			$this->add( 'Google', 'Título para Google', 'fail', 'La página no tiene título.', array(
				8, 'Ponle un título claro a tu web',
				'Tu página no tiene título, que es el texto azul que aparece en Google. Debe decir qué haces y dónde, por ejemplo: «Peluquería en Granada | Nombre».',
			) );
		} elseif ( $len < 15 ) {
			$this->add( 'Google', 'Título para Google', 'warn', 'El título es ' . self::quote( $title ) . ' (' . $len . ' caracteres).', array(
				5, 'Haz más descriptivo el título de tu web',
				'El título que ve Google es solo ' . self::quote( $title ) . '. Añade qué ofreces y en qué ciudad para que te elijan al buscar.',
			) );
		} elseif ( $len > 65 ) {
			$this->add( 'Google', 'Título para Google', 'warn', 'El título tiene ' . $len . ' caracteres: ' . self::quote( $title ) . '.', array(
				4, 'Acorta el título de tu web',
				'El título de tu web tiene ' . $len . ' caracteres y Google lo cortará. Deja lo importante al principio: qué haces y dónde.',
			) );
		} else {
			$this->add( 'Google', 'Título para Google', 'pass', self::quote( $title ) . '.' );
		}

		$desc = $this->meta( 'name', 'description' );
		$dlen = mb_strlen( (string) $desc );
		if ( ! $desc ) {
			$this->add( 'Google', 'Descripción para Google', 'fail', 'No tiene meta descripción.', array(
				6, 'Escribe la descripción que verá la gente en Google',
				'Tu web no tiene descripción, así que Google muestra un fragmento cualquiera bajo tu nombre. Dos frases que expliquen lo que ofreces y por qué elegirte animan a hacer clic.',
			) );
		} elseif ( $dlen < 70 || $dlen > 165 ) {
			$this->add( 'Google', 'Descripción para Google', 'warn', 'La descripción tiene ' . $dlen . ' caracteres (lo recomendable es entre 70 y 160).', array(
				3, 'Ajusta la descripción que aparece en Google',
				$dlen < 70 ? 'La descripción de tu web es muy corta. Aprovecha ese espacio para explicar qué ofreces y animar a hacer clic.' : 'La descripción de tu web es demasiado larga y Google la cortará. Resume lo esencial en unas 150 letras.',
			) );
		} else {
			$this->add( 'Google', 'Descripción para Google', 'pass', 'Tiene una descripción de ' . $dlen . ' caracteres.' );
		}

		$h1 = $this->q( '//h1' );
		if ( 0 === count( $h1 ) ) {
			$this->add( 'Google', 'Titular principal (H1)', 'fail', 'No hay ningún titular principal (H1) en el código.', array(
				6, 'Añade un titular principal a tu página',
				'Tu página no tiene un titular principal en el código. Google lo usa para entender de qué trata; debería decir claramente qué ofreces.',
			) );
		} elseif ( count( $h1 ) > 1 ) {
			$this->add( 'Google', 'Titular principal (H1)', 'warn', 'Hay ' . count( $h1 ) . ' titulares principales (H1).', array(
				2, 'Deja un solo titular principal',
				'Tu página tiene ' . count( $h1 ) . ' titulares principales. Tener uno solo ayuda a Google a entender cuál es el tema central.',
			) );
		} else {
			$this->add( 'Google', 'Titular principal (H1)', 'pass', 'Hay un único titular principal.' );
		}

		$imgs = $this->q( '//img' );
		if ( $imgs ) {
			$no_alt = count( array_filter( $imgs, function ( $i ) {
				return ! $i->hasAttribute( 'alt' );
			} ) );
			if ( $no_alt / count( $imgs ) > 0.2 ) {
				$this->add( 'Google', 'Imágenes descritas', 'warn', $no_alt . ' de ' . count( $imgs ) . ' imágenes no tienen texto alternativo.', array(
					3, 'Describe tus imágenes',
					'Varias de tus imágenes no tienen descripción. Google no «ve» las fotos: una breve descripción le ayuda a mostrarlas en búsquedas y mejora la accesibilidad.',
				) );
			} else {
				$this->add( 'Google', 'Imágenes descritas', 'pass', ( count( $imgs ) - $no_alt ) . ' de ' . count( $imgs ) . ' imágenes tienen texto alternativo.' );
			}
		}

		$og_t = $this->meta( 'property', 'og:title' );
		$og_i = $this->meta( 'property', 'og:image' );
		if ( $og_t && $og_i ) {
			$this->add( 'Google', 'Vista previa al compartir', 'pass', 'Tiene título e imagen para WhatsApp y redes sociales.' );
		} else {
			$this->add( 'Google', 'Vista previa al compartir', 'warn', 'Falta ' . ( ! $og_t && ! $og_i ? 'el título y la imagen' : ( ! $og_t ? 'el título' : 'la imagen' ) ) . ' para la vista previa al compartir (Open Graph).', array(
				3, 'Cuida cómo se ve tu web al compartirla',
				'Cuando alguien envía tu web por WhatsApp o redes, no aparece una vista previa completa con imagen. Configurarla hace que el enlace parezca más profesional y reciba más clics.',
			) );
		}
	}

	/* -------------------------------------------------------------- contenido */

	private function content( $words ) {
		$h1n   = $this->q( '//h1' );
		$h1    = $h1n ? $this->text_of( $h1n[0] ) : '';
		$h1w   = count( self::words( $h1 ) );
		if ( $h1w >= 2 && $h1w <= 15 ) {
			$this->add( 'Contenido', 'Titular claro', 'pass', 'El titular dice: ' . self::quote( $h1 ) . '.' );
		} else {
			$this->add( 'Contenido', 'Titular claro', 'warn', $h1 ? 'El titular es ' . self::quote( $h1 ) . '.' : 'No hay un titular principal con texto.', array(
				7, 'Explica en una frase qué ofreces',
				'Al entrar en tu web no hay un titular claro que diga qué haces y para quién. Tienes unos segundos para convencer: una frase como «Fisioterapia deportiva en Granada» funciona mejor que un eslogan genérico.',
			) );
		}

		if ( $words < 300 ) {
			$this->add( 'Contenido', 'Información suficiente', $words < 150 ? 'fail' : 'warn', 'La página tiene unas ' . $words . ' palabras de texto.', array(
				$words < 150 ? 7 : 4, 'Cuenta más sobre tu negocio',
				'Tu página tiene muy poco texto (unas ' . $words . ' palabras). Explica tus servicios, precios orientativos, zona de trabajo y por qué elegirte: ayuda a convencer a quien te visita y a que Google te encuentre.',
			) );
		} else {
			$this->add( 'Contenido', 'Información suficiente', 'pass', 'La página tiene unas ' . $words . ' palabras de texto.' );
		}

		$subs = count( $this->q( '//h2|//h3' ) );
		if ( $subs < 2 ) {
			$this->add( 'Contenido', 'Contenido ordenado', 'warn', 'Solo hay ' . $subs . ' subtítulos (H2/H3).', array(
				3, 'Ordena tu contenido con subtítulos',
				'Tu página apenas tiene subtítulos, lo que la hace difícil de leer por encima. Divide la información en bloques claros: servicios, precios, opiniones, contacto.',
			) );
		} else {
			$this->add( 'Contenido', 'Contenido ordenado', 'pass', $subs . ' subtítulos ordenan el contenido.' );
		}

		$cta_re  = '/(?<![\p{L}])(llam[ae]|llámanos|contact[ae]|contáctanos|escr[ií]benos|reserv[ae]|reservar|pide|pedir|solicit[ae]|presupuesto|compra|comprar|cita previa|empieza|suscr[ií]bete|reg[ií]strate|descarga|apúntate|inscr[ií]bete|book|call|contact us|get started|sign up|buy|shop|order)(?![\p{L}])/iu';
		$found   = array();
		foreach ( $this->q( '//a|//button|//input[@type="submit"]' ) as $el ) {
			$t = $this->text_of( $el );
			if ( '' === $t ) {
				$t = self::clean( $el->getAttribute( 'value' ) ?: $el->getAttribute( 'aria-label' ) );
			}
			if ( '' !== $t && mb_strlen( $t ) < 60 && preg_match( $cta_re, $t ) ) {
				$found[ $t ] = true;
			}
		}
		if ( $found ) {
			$this->add( 'Contenido', 'Botones que invitan a actuar', 'pass', 'Por ejemplo: ' . implode( ', ', array_map( function ( $t ) {
				return self::quote( $t, 40 );
			}, array_slice( array_keys( $found ), 0, 2 ) ) ) . '.' );
		} else {
			$this->add( 'Contenido', 'Botones que invitan a actuar', 'warn', 'No hay botones del tipo «Llámanos», «Reserva» o «Pide presupuesto».', array(
				8, 'Dile al visitante qué hacer a continuación',
				'Tu web no tiene botones claros como «Reserva ahora» o «Pide presupuesto». Si no se lo pones fácil, muchas visitas se irán sin contactar.',
			) );
		}
	}

	/* --------------------------------------------------------------- contacto */

	private function contact() {
		$tel = $wa = $mail = $contact_link = $booking = null;
		foreach ( $this->q( '//a[@href]' ) as $a ) {
			$href = trim( $a->getAttribute( 'href' ) );
			$text = $this->text_of( $a );
			if ( ! $tel && preg_match( '/^tel:/i', $href ) ) {
				$tel = preg_replace( '/^tel:/i', '', $href );
			}
			if ( ! $wa && preg_match( '#(wa\.me/|api\.whatsapp\.com|web\.whatsapp\.com|^whatsapp:)#i', $href ) ) {
				$wa = true;
			}
			if ( ! $mail && preg_match( '/^mailto:/i', $href ) ) {
				$mail = true;
			}
			if ( ! $contact_link && ( preg_match( '/contact/i', $href ) || preg_match( '/^contact/iu', $text ) ) ) {
				$contact_link = true;
			}
			if ( ! $booking && preg_match( '/(reserv|pedir cita|pide cita|cita previa|(?<![a-z])book(ing|\b)|calendly|eltenedor|thefork|treatwell|booksy|fresha|doctoralia|simplybook|opentable|covermanager)/i', $href . ' ' . $text ) ) {
				$booking = true;
			}
		}
		$forms = 0;
		foreach ( $this->q( '//form' ) as $f ) {
			if ( 'search' === $f->getAttribute( 'role' ) || $this->q( './/input[@type="search" or @name="s" or @name="q"]', $f ) ) {
				continue;
			}
			if ( count( $this->q( './/input[not(@type="hidden" or @type="submit" or @type="button")]|.//textarea|.//select', $f ) ) >= 2 ) {
				$forms++;
			}
		}

		// Teléfono español visible en el texto: 9 cifras empezando por 6, 7, 8 o 9.
		$phone = null;
		if ( preg_match( '/(?<![\d.,\/])(?:(?:\+|00)34[\s-]?)?[6789]\d{2}(?:[\s-]?\d{3}[\s-]?\d{3}|[\s-]?\d{2}[\s-]?\d{2}[\s-]?\d{2})(?!\d|[.,]\d)/', $this->text, $m ) ) {
			$phone = trim( $m[0] );
		}

		if ( $tel ) {
			$this->add( 'Contacto', 'Teléfono que se puede pulsar', 'pass', 'El teléfono ' . $tel . ' se puede pulsar para llamar.' );
		} elseif ( $phone ) {
			$this->add( 'Contacto', 'Teléfono que se puede pulsar', 'warn', 'Aparece el teléfono ' . $phone . ', pero no se puede pulsar para llamar.', array(
				7, 'Haz que llamarte sea un solo toque',
				'Tu teléfono aparece en la web, pero en el móvil no se puede pulsar para llamar. Convertirlo en un botón de llamada es fácil y elimina una barrera para contactarte.',
			) );
		} else {
			$this->add( 'Contacto', 'Teléfono que se puede pulsar', 'fail', 'No hemos encontrado ningún teléfono en esta página.', array(
				8, 'Muestra tu teléfono y que se pueda llamar con un toque',
				'No hemos encontrado tu teléfono en esta página. Para un negocio local, poder llamar con un solo toque desde el móvil es una de las formas más directas de conseguir clientes.',
			) );
		}

		if ( $wa ) {
			$this->add( 'Contacto', 'WhatsApp', 'pass', 'Hay un enlace directo a WhatsApp.' );
		} else {
			$this->add( 'Contacto', 'WhatsApp', 'warn', 'No hay ningún enlace directo a WhatsApp.', array(
				5, 'Añade un botón de WhatsApp',
				'Muchos clientes prefieren escribir antes que llamar. Un botón de WhatsApp en tu web les permite preguntar en segundos, sin tener que buscar tu número.',
			) );
		}

		if ( $forms || $mail || $booking ) {
			$what = array();
			if ( $forms ) {
				$what[] = 'formulario';
			}
			if ( $booking ) {
				$what[] = 'reservas o citas';
			}
			if ( $mail ) {
				$what[] = 'email';
			}
			$this->add( 'Contacto', 'Otras formas de contacto', 'pass', 'Encontrado: ' . implode( ', ', $what ) . '.' );
		} elseif ( $contact_link ) {
			$this->add( 'Contacto', 'Otras formas de contacto', 'pass', 'Hay un enlace a la página de contacto.' );
		} else {
			$this->add( 'Contacto', 'Otras formas de contacto', 'warn', 'No hay formulario, email ni enlace a una página de contacto.', array(
				6, 'Facilita una forma de escribirte',
				'No hemos encontrado formulario, email ni página de contacto. Quien te visita fuera de tu horario necesita una manera sencilla de dejarte su mensaje.',
			) );
		}
	}
}
