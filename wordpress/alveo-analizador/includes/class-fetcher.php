<?php
/**
 * Descarga segura de páginas web externas (protección frente a SSRF).
 *
 * - Solo http/https, puertos 80 y 443, sin usuario ni contraseña en la URL.
 * - Resuelve el DNS y rechaza IPs privadas, locales o reservadas (IPv4/IPv6).
 * - cURL se conecta a la IP ya validada (CURLOPT_RESOLVE): evita DNS rebinding.
 * - Redirecciones manuales (máx. 5) revalidando cada salto.
 * - Límites de tiempo y de tamaño (también tras descomprimir).
 */

defined( 'ABSPATH' ) || exit;

class Alveo_Analizador_Error extends Exception {}

class Alveo_Analizador_Fetcher {

	const MAX_REDIRECTS = 5;
	const MAX_BYTES     = 3145728; // 3 MB de HTML.
	const TIMEOUT       = 12;      // Segundos en total.
	const USER_AGENT    = 'Mozilla/5.0 (compatible; ALVEO-Analizador/1.0; +https://alveoagencia.es/)';

	/** Rangos no públicos (CIDR). */
	private static $blocked = array(
		'0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8', '169.254.0.0/16',
		'172.16.0.0/12', '192.0.0.0/24', '192.0.2.0/24', '192.88.99.0/24', '192.168.0.0/16',
		'198.18.0.0/15', '198.51.100.0/24', '203.0.113.0/24', '224.0.0.0/4', '240.0.0.0/4',
		'::/128', '::1/128', '64:ff9b::/96', '100::/64', '2001::/23', '2001:db8::/32',
		'2002::/16', 'fc00::/7', 'fe80::/10', 'fec0::/10', 'ff00::/8',
	);

	public static function is_public_ip( $ip ) {
		$bin = @inet_pton( $ip );
		if ( false === $bin ) {
			return false;
		}
		// IPv4 mapeada en IPv6 (::ffff:a.b.c.d): se valida como IPv4.
		if ( 16 === strlen( $bin ) && substr( $bin, 0, 12 ) === str_repeat( "\0", 10 ) . "\xff\xff" ) {
			return self::is_public_ip( inet_ntop( substr( $bin, 12 ) ) );
		}
		foreach ( self::$blocked as $cidr ) {
			list( $net, $bits ) = explode( '/', $cidr );
			$net_bin = inet_pton( $net );
			if ( strlen( $net_bin ) !== strlen( $bin ) ) {
				continue;
			}
			$bytes = intdiv( (int) $bits, 8 );
			$rest  = (int) $bits % 8;
			if ( substr( $bin, 0, $bytes ) !== substr( $net_bin, 0, $bytes ) ) {
				continue;
			}
			if ( 0 === $rest ) {
				return false;
			}
			$mask = chr( ( 0xff << ( 8 - $rest ) ) & 0xff );
			if ( ( $bin[ $bytes ] & $mask ) === ( $net_bin[ $bytes ] & $mask ) ) {
				return false;
			}
		}
		return true;
	}

	/** Normaliza la URL escrita por el usuario. */
	public static function normalize( $input ) {
		$raw = trim( (string) $input );
		if ( '' === $raw || strlen( $raw ) > 2048 ) {
			throw new Alveo_Analizador_Error( 'Escribe la dirección de tu web, por ejemplo: www.tunegocio.es' );
		}
		if ( ! preg_match( '#^[a-z][a-z0-9+.-]*://#i', $raw ) ) {
			$raw = 'https://' . $raw;
		}
		$parts = self::check_shape( $raw );
		return self::build( $parts );
	}

	private static function build( $p ) {
		$host = ( false !== strpos( $p['host'], ':' ) ) ? '[' . $p['host'] . ']' : $p['host'];
		$url  = $p['scheme'] . '://' . $host;
		if ( ! empty( $p['port'] ) ) {
			$url .= ':' . $p['port'];
		}
		$url .= isset( $p['path'] ) && '' !== $p['path'] ? $p['path'] : '/';
		if ( isset( $p['query'] ) && '' !== $p['query'] ) {
			$url .= '?' . $p['query'];
		}
		return $url;
	}

	/** Valida esquema, credenciales, puerto y nombre de host. Devuelve parse_url(). */
	private static function check_shape( $url ) {
		$p = wp_parse_url( $url );
		if ( ! $p || empty( $p['host'] ) || empty( $p['scheme'] ) ) {
			throw new Alveo_Analizador_Error( 'La dirección no es válida. Escríbela así: www.tunegocio.es' );
		}
		$p['scheme'] = strtolower( $p['scheme'] );
		if ( 'http' !== $p['scheme'] && 'https' !== $p['scheme'] ) {
			throw new Alveo_Analizador_Error( 'Solo se pueden analizar direcciones web (http o https).' );
		}
		if ( isset( $p['user'] ) || isset( $p['pass'] ) ) {
			throw new Alveo_Analizador_Error( 'La dirección no puede incluir usuario ni contraseña.' );
		}
		if ( isset( $p['port'] ) && ! in_array( (int) $p['port'], array( 80, 443 ), true ) ) {
			throw new Alveo_Analizador_Error( 'Solo se pueden analizar webs públicas en los puertos habituales.' );
		}
		$host      = strtolower( trim( $p['host'], '[]' ) );
		$p['host'] = $host;
		if ( filter_var( $host, FILTER_VALIDATE_IP ) ) {
			if ( ! self::is_public_ip( $host ) ) {
				throw new Alveo_Analizador_Error( 'Esa dirección no es una web pública.' );
			}
			return $p;
		}
		if ( false === strpos( $host, '.' ) ) {
			throw new Alveo_Analizador_Error( 'Escribe la dirección completa, por ejemplo: www.tunegocio.es' );
		}
		if ( ! preg_match( '/^[a-z0-9.-]+$/', $host ) && ! preg_match( '/^[\p{L}\p{N}.-]+$/u', $host ) ) {
			throw new Alveo_Analizador_Error( 'La dirección no es válida. Escríbela así: www.tunegocio.es' );
		}
		if ( 'localhost' === $host || preg_match( '/\.(local|localhost|internal|intranet|lan|home|corp|arpa)$/', $host ) ) {
			throw new Alveo_Analizador_Error( 'Esa dirección no es una web pública.' );
		}
		return $p;
	}

	/** Resuelve el host y devuelve una IP pública, o lanza error. */
	private static function resolve( $host ) {
		if ( filter_var( $host, FILTER_VALIDATE_IP ) ) {
			return $host;
		}
		if ( function_exists( 'idn_to_ascii' ) && preg_match( '/[^\x20-\x7e]/', $host ) ) {
			$ascii = idn_to_ascii( $host, IDNA_DEFAULT, INTL_IDNA_VARIANT_UTS46 );
			$host  = $ascii ? $ascii : $host;
		}
		$ips = array();
		$v4  = @gethostbynamel( $host );
		if ( is_array( $v4 ) ) {
			$ips = $v4;
		}
		$v6 = @dns_get_record( $host, DNS_AAAA );
		if ( is_array( $v6 ) ) {
			foreach ( $v6 as $rec ) {
				if ( ! empty( $rec['ipv6'] ) ) {
					$ips[] = $rec['ipv6'];
				}
			}
		}
		if ( ! $ips ) {
			throw new Alveo_Analizador_Error( 'No encontramos ninguna web en esa dirección. Revisa que esté bien escrita.' );
		}
		foreach ( $ips as $ip ) {
			if ( ! self::is_public_ip( $ip ) ) {
				throw new Alveo_Analizador_Error( 'Esa dirección no es una web pública.' );
			}
		}
		// Preferimos IPv4 (compatibilidad máxima en alojamientos compartidos).
		return $ips[0];
	}

	/**
	 * Descarga la página. Devuelve:
	 * [ final_url, status, headers(array minúsculas), html, ttfb_ms, html_bytes, redirects ]
	 */
	public static function fetch( $url ) {
		if ( ! function_exists( 'curl_init' ) ) {
			throw new Alveo_Analizador_Error( 'El servidor no tiene cURL activado y no puede analizar webs.' );
		}
		$deadline  = microtime( true ) + self::TIMEOUT;
		$redirects = 0;
		$current   = $url;

		while ( true ) {
			$p    = self::check_shape( $current );
			$ip   = self::resolve( $p['host'] );
			$port = isset( $p['port'] ) ? (int) $p['port'] : ( 'https' === $p['scheme'] ? 443 : 80 );
			$left = $deadline - microtime( true );
			if ( $left <= 1 ) {
				throw new Alveo_Analizador_Error( 'La web tardó demasiado en responder.' );
			}
			$res = self::request( $current, $p['host'], $port, $ip, $left );

			if ( $res['status'] >= 300 && $res['status'] < 400 && ! empty( $res['headers']['location'] ) ) {
				if ( ++$redirects > self::MAX_REDIRECTS ) {
					throw new Alveo_Analizador_Error( 'La web redirige demasiadas veces.' );
				}
				$current = self::resolve_location( $res['headers']['location'], $current );
				continue;
			}
			if ( $res['status'] >= 400 ) {
				if ( in_array( $res['status'], array( 401, 403, 429, 503 ), true ) ) {
					throw new Alveo_Analizador_Error( sprintf( 'La web ha bloqueado nuestro análisis automático (código %d). Suele deberse a una protección anti-bots.', $res['status'] ) );
				}
				throw new Alveo_Analizador_Error( sprintf( 'La web respondió con un error (código %d). Revisa que la dirección sea correcta.', $res['status'] ) );
			}
			$ctype = isset( $res['headers']['content-type'] ) ? $res['headers']['content-type'] : '';
			if ( '' !== $ctype && ! preg_match( '/html|xml/i', $ctype ) ) {
				throw new Alveo_Analizador_Error( 'Esa dirección no es una página web (no devuelve HTML).' );
			}
			return array(
				'final_url'  => $current,
				'status'     => $res['status'],
				'headers'    => $res['headers'],
				'html'       => self::to_utf8( $res['body'], $ctype ),
				'ttfb_ms'    => $res['ttfb_ms'],
				'html_bytes' => strlen( $res['body'] ),
				'redirects'  => $redirects,
			);
		}
	}

	private static function resolve_location( $location, $base ) {
		$location = trim( $location );
		if ( preg_match( '#^[a-z][a-z0-9+.-]*://#i', $location ) ) {
			return $location;
		}
		$b      = wp_parse_url( $base );
		$host   = ( false !== strpos( $b['host'], ':' ) ) ? '[' . $b['host'] . ']' : $b['host'];
		$origin = $b['scheme'] . '://' . $host . ( isset( $b['port'] ) ? ':' . $b['port'] : '' );
		if ( 0 === strpos( $location, '//' ) ) {
			return $b['scheme'] . ':' . $location;
		}
		if ( 0 === strpos( $location, '/' ) ) {
			return $origin . $location;
		}
		$path = isset( $b['path'] ) ? $b['path'] : '/';
		$dir  = substr( $path, 0, strrpos( $path, '/' ) + 1 );
		return $origin . $dir . $location;
	}

	private static function request( $url, $host, $port, $ip, $timeout ) {
		$headers = array();
		$body    = '';
		$ch      = curl_init();
		$pin     = ( false !== strpos( $ip, ':' ) ) ? '[' . $ip . ']' : $ip;
		$opts    = array(
			CURLOPT_URL            => $url,
			CURLOPT_RESOLVE        => array( $host . ':' . $port . ':' . $pin ),
			CURLOPT_PROXY          => '', // Ignora proxys del entorno: conexión directa a la IP validada.
			CURLOPT_FOLLOWLOCATION => false,
			CURLOPT_TIMEOUT_MS     => (int) ( $timeout * 1000 ),
			CURLOPT_CONNECTTIMEOUT => 6,
			CURLOPT_ENCODING       => '',
			CURLOPT_USERAGENT      => self::USER_AGENT,
			CURLOPT_HTTPHEADER     => array(
				'Accept: text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
				'Accept-Language: es-ES,es;q=0.9,en;q=0.5',
			),
			CURLOPT_SSL_VERIFYPEER => true,
			CURLOPT_SSL_VERIFYHOST => 2,
			CURLOPT_HEADERFUNCTION => function ( $c, $line ) use ( &$headers ) {
				$len = strlen( $line );
				if ( preg_match( '#^HTTP/#i', $line ) ) {
					$headers = array(); // Nueva respuesta (p. ej. tras 100 Continue).
				} elseif ( false !== strpos( $line, ':' ) ) {
					list( $k, $v ) = explode( ':', $line, 2 );
					$headers[ strtolower( trim( $k ) ) ] = trim( $v );
				}
				return $len;
			},
			CURLOPT_WRITEFUNCTION  => function ( $c, $chunk ) use ( &$body ) {
				$body .= $chunk;
				return strlen( $body ) > self::MAX_BYTES ? -1 : strlen( $chunk );
			},
		);
		if ( defined( 'CURLOPT_PROTOCOLS_STR' ) ) {
			$opts[ CURLOPT_PROTOCOLS_STR ] = 'http,https';
		} else {
			$opts[ CURLOPT_PROTOCOLS ] = CURLPROTO_HTTP | CURLPROTO_HTTPS; // phpcs:ignore
		}
		curl_setopt_array( $ch, $opts );
		$ok     = curl_exec( $ch );
		$errno  = curl_errno( $ch );
		$status = (int) curl_getinfo( $ch, CURLINFO_RESPONSE_CODE );
		$ttfb   = (int) round( curl_getinfo( $ch, CURLINFO_STARTTRANSFER_TIME ) * 1000 );
		curl_close( $ch );

		if ( false === $ok ) {
			if ( 23 === $errno && strlen( $body ) > self::MAX_BYTES ) {
				throw new Alveo_Analizador_Error( 'La página es demasiado grande para analizarla.' );
			}
			if ( 28 === $errno ) {
				throw new Alveo_Analizador_Error( 'La web tardó demasiado en responder.' );
			}
			if ( in_array( $errno, array( 35, 51, 53, 54, 58, 59, 60, 64, 66, 77, 80, 82, 83, 90, 91 ), true ) ) {
				throw new Alveo_Analizador_Error( 'La web tiene un problema con su certificado de seguridad (HTTPS) y no se pudo abrir de forma segura.' );
			}
			throw new Alveo_Analizador_Error( 'No pudimos conectar con la web. Puede estar caída o bloquear visitas automáticas.' );
		}
		return array(
			'status'  => $status,
			'headers' => $headers,
			'body'    => $body,
			'ttfb_ms' => $ttfb,
		);
	}

	private static function to_utf8( $body, $ctype ) {
		$charset = '';
		if ( preg_match( '/charset=["\']?([\w-]+)/i', $ctype, $m ) ) {
			$charset = $m[1];
		} elseif ( preg_match( '/<meta[^>]+charset=["\']?([\w-]+)/i', substr( $body, 0, 4096 ), $m ) ) {
			$charset = $m[1];
		}
		$charset = strtoupper( $charset );
		if ( $charset && 'UTF-8' !== $charset && 'UTF8' !== $charset && function_exists( 'mb_convert_encoding' ) ) {
			$converted = @mb_convert_encoding( $body, 'UTF-8', $charset );
			if ( false !== $converted ) {
				return $converted;
			}
		}
		return $body;
	}
}
