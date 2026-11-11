<?php
/**
 * Plugin Name:       Analizador Web de ALVEO
 * Description:       Herramienta gratuita: el visitante escribe la dirección de su web y recibe las 3 mejoras más importantes, con un botón para hablar con ALVEO por WhatsApp. Úsala con el shortcode [alveo_analizador whatsapp="34XXXXXXXXX"].
 * Version:           1.0.0
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * Author:            ALVEO
 * Author URI:        https://alveoagencia.es/
 * License:           GPL-2.0-or-later
 * Text Domain:       alveo-analizador
 */

defined( 'ABSPATH' ) || exit;

define( 'ALVEO_AN_VERSION', '1.0.0' );
define( 'ALVEO_AN_URL', plugin_dir_url( __FILE__ ) );

require_once __DIR__ . '/includes/class-fetcher.php';
require_once __DIR__ . '/includes/class-analyzer.php';

/** Límites de uso por visitante. */
const ALVEO_AN_LIMITS = array(
	array( 5, 600 ),    // 5 análisis cada 10 minutos.
	array( 25, 86400 ), // 25 análisis al día.
);

/* --------------------------------------------------------------- shortcode */

add_action( 'wp_enqueue_scripts', function () {
	wp_register_style( 'alveo-analizador', ALVEO_AN_URL . 'assets/analizador.css', array(), ALVEO_AN_VERSION );
	wp_register_script( 'alveo-analizador', ALVEO_AN_URL . 'assets/analizador.js', array(), ALVEO_AN_VERSION, true );
} );

add_shortcode( 'alveo_analizador', function ( $atts ) {
	$atts = shortcode_atts( array( 'whatsapp' => '' ), $atts, 'alveo_analizador' );
	$wa   = preg_replace( '/\D/', '', $atts['whatsapp'] );

	wp_enqueue_style( 'alveo-analizador' );
	wp_enqueue_script( 'alveo-analizador' );

	// Avisos solo visibles para administradores (requisitos del servidor y configuración).
	$admin_notes = array();
	if ( current_user_can( 'manage_options' ) ) {
		if ( ! function_exists( 'curl_init' ) ) {
			$admin_notes[] = 'El servidor no tiene la extensión cURL de PHP. Actívala en Hostinger: hPanel → Avanzado → Configuración de PHP → Extensiones.';
		}
		if ( ! class_exists( 'DOMDocument' ) ) {
			$admin_notes[] = 'El servidor no tiene la extensión DOM de PHP. Actívala en Hostinger: hPanel → Avanzado → Configuración de PHP → Extensiones.';
		}
		if ( strlen( $wa ) < 9 ) {
			$admin_notes[] = 'Falta tu número de WhatsApp. Escribe el shortcode así: [alveo_analizador whatsapp="34600000000"] (con prefijo 34, sin espacios ni +).';
		}
	}

	ob_start();
	include __DIR__ . '/templates/analizador.php';
	return ob_get_clean();
} );

/* -------------------------------------------------------------------- API */

add_action( 'rest_api_init', function () {
	register_rest_route( 'alveo-analizador/v1', '/analizar', array(
		'methods'             => 'POST',
		'permission_callback' => '__return_true', // Herramienta pública.
		'args'                => array(
			'url' => array( 'type' => 'string', 'required' => true ),
		),
		'callback'            => 'alveo_an_rest_analyze',
	) );
} );

function alveo_an_error( $message, $status ) {
	return new WP_REST_Response( array( 'message' => $message ), $status );
}

/** Aplica los límites de uso. Devuelve null si se permite, o una respuesta 429. */
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
			return alveo_an_error(
				$window > 3600
					? 'Has alcanzado el máximo de análisis gratuitos por hoy. Si quieres, escríbenos y lo revisamos contigo.'
					: sprintf( 'Has hecho varios análisis seguidos. Espera %d min y vuelve a intentarlo.', max( 1, $wait ) ),
				429
			);
		}
	}
	$log[] = $now;
	set_transient( $key, $log, DAY_IN_SECONDS );
	return null;
}

function alveo_an_rest_analyze( WP_REST_Request $request ) {
	nocache_headers();
	try {
		$url = Alveo_Analizador_Fetcher::normalize( $request->get_param( 'url' ) );
	} catch ( Alveo_Analizador_Error $e ) {
		return alveo_an_error( $e->getMessage(), 400 );
	}
	$limited = alveo_an_rate_limit();
	if ( $limited ) {
		return $limited;
	}
	if ( function_exists( 'set_time_limit' ) ) {
		@set_time_limit( 40 ); // phpcs:ignore
	}
	try {
		$page   = Alveo_Analizador_Fetcher::fetch( $url );
		$result = ( new Alveo_Analizador_Analyzer( $page ) )->run();
	} catch ( Alveo_Analizador_Error $e ) {
		return alveo_an_error( $e->getMessage(), 422 );
	} catch ( Throwable $e ) {
		return alveo_an_error( 'Ha ocurrido un error inesperado al analizar la web. Inténtalo de nuevo.', 500 );
	}
	$final = wp_parse_url( $page['final_url'] );
	return new WP_REST_Response( array_merge( array(
		'url'  => $page['final_url'],
		'site' => preg_replace( '/^www\./', '', $final['host'] ) . ( isset( $final['path'] ) && '/' !== $final['path'] ? $final['path'] : '' ),
	), $result ), 200 );
}
