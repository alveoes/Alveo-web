<?php
/**
 * Pruebas del analizador con HTML de ejemplo (no son análisis de webs reales).
 * Ejecutar: php tests/run-tests.php
 * Este directorio no hace falta subirlo al servidor.
 */

define( 'ABSPATH', __DIR__ );
function wp_parse_url( $url ) { return parse_url( $url ); } // phpcs:ignore
require __DIR__ . '/../includes/class-fetcher.php';
require __DIR__ . '/../includes/class-analyzer.php';

$fails = 0;
function ok( $cond, $name ) {
	global $fails;
	echo ( $cond ? "ok   " : "FALLO" ) . " - $name\n";
	if ( ! $cond ) {
		$fails++;
	}
}
function analyze( $html, $extra = array() ) {
	$page = array_merge( array(
		'final_url'  => 'https://ejemplo.es/',
		'status'     => 200,
		'headers'    => array( 'content-encoding' => 'gzip' ),
		'html'       => $html,
		'ttfb_ms'    => 300,
		'html_bytes' => strlen( $html ),
		'redirects'  => 0,
	), $extra );
	return ( new Alveo_Analizador_Analyzer( $page ) )->run();
}
function labels( $r ) {
	return array_column( $r['strengths'], 'label' );
}
function titles( $r ) {
	return implode( ' | ', array_column( $r['improvements'], 'title' ) );
}

$lorem = str_repeat( '<p>Somos una peluquería del centro de Granada con más de diez años cuidando a nuestros clientes. Trabajamos con productos naturales.</p>', 40 );

// 1. Negocio local bien preparado.
$good = '<!doctype html><html lang="es"><head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Peluquería Lola | Peluquería en el centro de Granada</title>
<meta name="description" content="Peluquería en el centro de Granada. Cortes, color y peinados de evento con productos naturales. Pide cita online o por WhatsApp.">
<meta property="og:title" content="Peluquería Lola"><meta property="og:image" content="https://ejemplo.es/og.jpg">
</head><body><h1>Peluquería en el centro de Granada</h1><h2>Servicios</h2><h2>Precios</h2>' . $lorem . '
<a href="tel:+34958123456">958 123 456</a><a href="https://wa.me/34612345678">Escríbenos por WhatsApp</a>
<a href="https://booksy.com/es-es/123">Reservar cita</a><img src="a.jpg" alt="Salón"></body></html>';
$r = analyze( $good );
ok( 0 === count( $r['improvements'] ), 'web bien preparada: no se inventan mejoras' );
ok( in_array( 'Teléfono que se puede pulsar', labels( $r ), true ), 'detecta teléfono clicable' );
ok( in_array( 'WhatsApp', labels( $r ), true ), 'detecta WhatsApp' );
ok( in_array( 'Otras formas de contacto', labels( $r ), true ), 'detecta sistema de reservas' );
ok( in_array( 'Botones que invitan a actuar', labels( $r ), true ), 'detecta botones de acción' );

// 2. Web con problemas típicos.
$bad = '<html><head><title>Inicio</title><meta name="robots" content="noindex, nofollow"></head>
<body><div><img src="logo.png"><img src="foto.png"></div><p>Bienvenidos. Llámanos al 958 12 34 56.</p>
<a href="https://facebook.com/peluqueria">Facebook</a>
<form role="search"><input type="search" name="s"><input type="text" name="x"></form></body></html>';
$r = analyze( $bad, array( 'final_url' => 'http://ejemplo.es/' ) );
ok( 3 === count( $r['improvements'] ), 'web con problemas: 3 mejoras' );
ok( false !== strpos( titles( $r ), 'Google muestre tu web' ), 'prioriza el noindex' );
ok( false !== strpos( titles( $r ), 'móvil' ), 'prioriza la falta de adaptación al móvil' );
ok( false !== strpos( titles( $r ), 'HTTPS' ), 'detecta la falta de HTTPS' );
$all = analyze( $bad );
ok( ! in_array( 'Otras formas de contacto', labels( $all ), true ), 'facebook y un buscador no cuentan como contacto' );

// 3. Teléfono en texto sin enlace + sin falsos positivos.
$r     = analyze( '<html><head><meta name="viewport" content="width=device-width"></head><body><h1>Taller</h1><p>Precio 600.000.000 · código 7123456789012 · versión 1.958123456</p></body></html>' );
$texts = implode( ' ', array_column( $r['improvements'], 'evidence' ) );
ok( false !== strpos( $texts, 'No hemos encontrado ningún teléfono' ), 'no confunde precios ni códigos con teléfonos' );
$r     = analyze( str_replace( '<a href="tel:+34958123456">958 123 456</a>', '<p>Teléfono: 958 12 34 56</p>', $good ) );
$texts = implode( ' ', array_column( $r['improvements'], 'evidence' ) );
ok( false !== strpos( $texts, '958 12 34 56' ), 'detecta teléfono visible pero no clicable' );

// 4. Web hecha con JavaScript: avisa y no inventa.
$spa = '<!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>ALVEO Granada — Haz que tu negocio sea visible.</title><script type="module" src="/assets/index.js"></script></head><body><div id="root"></div></body></html>';
$r   = analyze( $spa );
ok( 1 === count( $r['notices'] ), 'web JavaScript: muestra aviso' );
ok( ! array_filter( $r['improvements'], function ( $i ) {
	return in_array( $i['area'], array( 'Contenido', 'Contacto' ), true );
} ), 'web JavaScript: no da mejoras de contenido ni contacto' );

// 5. Seguridad: IPs y URLs.
foreach ( array( '127.0.0.1', '10.0.0.1', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', '::', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:a9fe:a9fe' ) as $ip ) {
	ok( ! Alveo_Analizador_Fetcher::is_public_ip( $ip ), "bloquea $ip" );
}
foreach ( array( '8.8.8.8', '151.101.0.223', '2a04:4e42::223', '::ffff:808:808' ) as $ip ) {
	ok( Alveo_Analizador_Fetcher::is_public_ip( $ip ), "permite $ip" );
}
foreach ( array( 'file:///etc/passwd', 'http://localhost/', 'https://a:b@ejemplo.es', 'https://ejemplo.es:8443/', 'http://nas.local/', 'http://127.0.0.1/' ) as $u ) {
	$thrown = false;
	try {
		Alveo_Analizador_Fetcher::normalize( $u );
	} catch ( Alveo_Analizador_Error $e ) {
		$thrown = true;
	}
	ok( $thrown, "rechaza $u" );
}
ok( 'https://ejemplo.es/' === Alveo_Analizador_Fetcher::normalize( 'ejemplo.es' ), 'añade https:// si falta' );

echo $fails ? "\n$fails pruebas fallidas\n" : "\nTodas las pruebas correctas\n";
exit( $fails ? 1 : 0 );
