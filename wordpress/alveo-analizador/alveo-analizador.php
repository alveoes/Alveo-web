<?php
/**
 * Plugin Name:       Analizador Web de ALVEO
 * Description:       Herramienta gratuita: el visitante escribe la dirección de su web y recibe las 3 mejoras más importantes, con un botón para hablar con ALVEO por WhatsApp. Úsala con el shortcode [alveo_analizador whatsapp="34XXXXXXXXX"].
 * Version:           1.0.1
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * Author:            ALVEO
 * Author URI:        https://alveoagencia.es/
 * License:           GPL-2.0-or-later
 * Text Domain:       alveo-analizador
 */

defined( 'ABSPATH' ) || exit;

define( 'ALVEO_AN_VERSION', '1.0.1' );
define( 'ALVEO_AN_URL', plugin_dir_url( __FILE__ ) );
define( 'ALVEO_AN_DIR', __DIR__ );

require_once __DIR__ . '/includes/class-fetcher.php';
require_once __DIR__ . '/includes/class-analyzer.php';

/** Límites de uso por visitante. */
const ALVEO_AN_LIMITS = array(
	array( 5, 600 ),    // 5 análisis cada 10 minutos.
	array( 25, 86400 ), // 25 análisis al día.
);

/* ------------------------------------------------------------------ análisis */

/** Aplica los límites de uso. Devuelve null si se permite, o el mensaje de error. */
function alveo_an_rate_limit() {
	$ip  = isset( $_SERVER['REMOTE_ADDR'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) ) : 'unknown';
	$key = 'alveo_an_' . md5( wp_salt( 'nonce' ) . $ip );
	$now = time();
	$log = get_transient( $key );
	$log = is_array( $log ) ? $log : array();
	$log = array_values( array_filter( $log, function ( $t ) use ( $now ) {
		return $t > $now - 86400;
	} ) );
	foreach ( ALVEO_AN_LIMITS as $limit ) {
		list( $max, $window ) = $limit;
		$recent = array_filter( $log, function ( $t ) use ( $now, $window ) {
			return $t > $now - $window;
		} );
		if ( count( $recent ) >= $max ) {
			$wait = (int) ceil( ( min( $recent ) + $window - $now ) / 60 );
			return $window > 3600
				? 'Has alcanzado el máximo de análisis gratuitos por hoy. Si quieres, escríbenos y lo revisamos contigo.'
				: sprintf( 'Has hecho varios análisis seguidos. Espera %d min y vuelve a intentarlo.', max( 1, $wait ) );
		}
	}
	$log[] = $now;
	set_transient( $key, $log, DAY_IN_SECONDS );
	return null;
}

/**
 * Ejecuta un análisis completo y devuelve el HTML de resultados.
 *
 * @return array{ok:bool, html?:string, message?:string}
 */
function alveo_an_run( $raw_url, $wa ) {
	try {
		$url = Alveo_Analizador_Fetcher::normalize( $raw_url );
	} catch ( Alveo_Analizador_Error $e ) {
		return array( 'ok' => false, 'message' => $e->getMessage() );
	}
	$limited = alveo_an_rate_limit();
	if ( $limited ) {
		return array( 'ok' => false, 'message' => $limited );
	}
	if ( function_exists( 'set_time_limit' ) ) {
		@set_time_limit( 40 ); // phpcs:ignore
	}
	try {
		$page   = Alveo_Analizador_Fetcher::fetch( $url );
		$result = ( new Alveo_Analizador_Analyzer( $page ) )->run();
	} catch ( Alveo_Analizador_Error $e ) {
		return array( 'ok' => false, 'message' => $e->getMessage() );
	} catch ( Throwable $e ) {
		return array( 'ok' => false, 'message' => 'Ha ocurrido un error inesperado al analizar la web. Inténtalo de nuevo.' );
	}
	$final          = wp_parse_url( $page['final_url'] );
	$result['url']  = $page['final_url'];
	$result['site'] = preg_replace( '/^www\./', '', $final['host'] ) . ( isset( $final['path'] ) && '/' !== $final['path'] ? $final['path'] : '' );
	return array( 'ok' => true, 'html' => alveo_an_render_results( $result, $wa ) );
}

/** Pinta los resultados (se usa igual con JavaScript y sin él). */
function alveo_an_render_results( array $r, $wa ) {
	ob_start();
	include ALVEO_AN_DIR . '/templates/resultados.php';
	return ob_get_clean();
}

/* ------------------------------------------------- petición con JavaScript */

function alveo_an_ajax() {
	nocache_headers();
	$url = isset( $_POST['url'] ) ? wp_unslash( $_POST['url'] ) : ''; // phpcs:ignore WordPress.Security
	$wa  = isset( $_POST['wa'] ) ? preg_replace( '/\D/', '', wp_unslash( $_POST['wa'] ) ) : ''; // phpcs:ignore WordPress.Security
	$out = alveo_an_run( $url, $wa );
	if ( $out['ok'] ) {
		wp_send_json_success( array( 'html' => $out['html'] ) );
	}
	wp_send_json_error( array( 'message' => $out['message'] ), 200 );
}
add_action( 'wp_ajax_alveo_analizar', 'alveo_an_ajax' );
add_action( 'wp_ajax_nopriv_alveo_analizar', 'alveo_an_ajax' );

/* --------------------------------------------------------------- shortcode */

add_action( 'wp_enqueue_scripts', function () {
	wp_register_style( 'alveo-analizador', ALVEO_AN_URL . 'assets/analizador.css', array(), ALVEO_AN_VERSION );
} );

/** Comprobaciones del servidor, visibles solo para administradores. */
function alveo_an_admin_notes( $wa ) {
	$notes = array();
	if ( ! function_exists( 'curl_init' ) ) {
		$notes[] = 'El servidor no tiene la extensión cURL de PHP. Actívala en Hostinger: hPanel → Avanzado → Configuración de PHP → Extensiones.';
	}
	if ( ! class_exists( 'DOMDocument' ) ) {
		$notes[] = 'El servidor no tiene la extensión DOM de PHP. Actívala en Hostinger: hPanel → Avanzado → Configuración de PHP → Extensiones.';
	}
	if ( strlen( $wa ) < 9 ) {
		$notes[] = 'Falta tu número de WhatsApp. Escribe el shortcode así: [alveo_analizador whatsapp="34600000000"] (con prefijo 34, sin espacios ni +).';
	}
	$net = get_transient( 'alveo_an_net_ok' );
	if ( false === $net ) {
		$res = wp_remote_head( 'https://www.google.com/', array( 'timeout' => 8 ) );
		$net = is_wp_error( $res ) ? 'no' : 'si';
		set_transient( 'alveo_an_net_ok', $net, 'si' === $net ? HOUR_IN_SECONDS : 5 * MINUTE_IN_SECONDS );
	}
	if ( 'no' === $net ) {
		$notes[] = 'El servidor no ha podido conectarse a otras webs. Sin esa conexión no se puede analizar nada: consúltalo con el soporte de Hostinger.';
	}
	return $notes;
}

add_shortcode( 'alveo_analizador', function ( $atts ) {
	static $printed_script = false;

	$atts = shortcode_atts( array( 'whatsapp' => '' ), $atts, 'alveo_analizador' );
	$wa   = preg_replace( '/\D/', '', $atts['whatsapp'] );
	wp_enqueue_style( 'alveo-analizador' );

	$is_admin    = current_user_can( 'manage_options' );
	$admin_notes = $is_admin ? alveo_an_admin_notes( $wa ) : array();

	// Sin JavaScript (o si falla), el formulario se envía al servidor y aquí se analiza.
	$posted_url = '';
	$server_out = null;
	if ( isset( $_POST['alveo_an_url'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification
		if ( ! defined( 'DONOTCACHEPAGE' ) ) {
			define( 'DONOTCACHEPAGE', true );
		}
		do_action( 'litespeed_control_set_nocache', 'alveo analizador' );
		$posted_url = sanitize_text_field( wp_unslash( $_POST['alveo_an_url'] ) ); // phpcs:ignore WordPress.Security.NonceVerification
		$server_out = alveo_an_run( $posted_url, $wa );
	}

	ob_start();
	include ALVEO_AN_DIR . '/templates/analizador.php';
	if ( ! $printed_script ) {
		$printed_script = true;
		// Se imprime aquí (y no en el pie del tema) para que se cargue siempre.
		// Los atributos evitan que LiteSpeed y otros optimizadores lo combinen o retrasen.
		printf(
			'<script src="%s" defer data-no-optimize="1" data-no-defer="1" data-no-minify="1" data-cfasync="false" data-pagespeed-no-defer></script>',
			esc_url( ALVEO_AN_URL . 'assets/analizador.js?ver=' . ALVEO_AN_VERSION )
		);
	}
	return ob_get_clean();
} );
