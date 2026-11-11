<?php
/**
 * Plantilla del analizador. Variables: $wa (número WhatsApp), $admin_notes.
 *
 * @package alveo-analizador
 */

defined( 'ABSPATH' ) || exit;
?>
<div class="alveo-an" data-endpoint="<?php echo esc_url( rest_url( 'alveo-analizador/v1/analizar' ) ); ?>" data-whatsapp="<?php echo esc_attr( $wa ); ?>">

	<?php if ( $admin_notes ) : ?>
		<div class="alveo-an-admin" role="note">
			<strong>Solo lo ves tú (administrador):</strong>
			<ul><?php foreach ( $admin_notes as $note ) : ?><li><?php echo esc_html( $note ); ?></li><?php endforeach; ?></ul>
		</div>
	<?php endif; ?>

	<section class="alveo-an-hero">
		<div class="alveo-an-shell">
			<p class="alveo-an-kicker">ALVEO / Herramienta gratuita</p>
			<h2 class="alveo-an-display">Analiza tu web <em>gratis.</em></h2>
			<p class="alveo-an-lead">Escribe la dirección de tu negocio y te diremos las 3 mejoras más importantes para conseguir más clientes desde tu web. Explicadas sin tecnicismos.</p>

			<form class="alveo-an-form" novalidate>
				<label class="alveo-an-label" for="alveo-an-url">Dirección de tu web</label>
				<div class="alveo-an-row">
					<input id="alveo-an-url" class="alveo-an-input" name="url" type="text" inputmode="url" autocomplete="url" autocapitalize="off" spellcheck="false" placeholder="www.tunegocio.es" maxlength="2048" required>
					<button class="alveo-an-btn alveo-an-btn-dark" type="submit">Analizar mi web gratis <span aria-hidden="true">↗</span></button>
				</div>
				<p class="alveo-an-error" role="alert" hidden></p>
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

	<div class="alveo-an-results" hidden>
		<section class="alveo-an-band alveo-an-summary">
			<div class="alveo-an-shell">
				<p class="alveo-an-kicker">Diagnóstico de</p>
				<p class="alveo-an-site" data-slot="site"></p>
				<p class="alveo-an-meta" data-slot="meta"></p>
				<div class="alveo-an-notice" data-slot="notices" hidden></div>
			</div>
		</section>

		<section class="alveo-an-lime">
			<div class="alveo-an-shell">
				<p class="alveo-an-kicker">Por dónde empezar</p>
				<h3 class="alveo-an-h" data-slot="title">Las 3 mejoras más importantes</h3>
				<ol class="alveo-an-list" data-slot="improvements"></ol>
				<p class="alveo-an-none" data-slot="none" hidden></p>
			</div>
		</section>

		<section class="alveo-an-good" data-slot="strengths-wrap" hidden>
			<div class="alveo-an-shell">
				<p class="alveo-an-kicker">Lo que ya haces bien</p>
				<ul class="alveo-an-chips" data-slot="strengths"></ul>
			</div>
		</section>

		<section class="alveo-an-band alveo-an-cta">
			<div class="alveo-an-shell alveo-an-cta-grid">
				<div>
					<p class="alveo-an-kicker">Siguiente paso</p>
					<h3 class="alveo-an-h">¿Lo mejoramos juntos?</h3>
					<p>Este análisis es automático. Escríbenos por WhatsApp y el equipo de ALVEO revisará tu web contigo, sin compromiso.</p>
				</div>
				<div class="alveo-an-cta-actions">
					<a class="alveo-an-btn alveo-an-btn-lime" data-slot="whatsapp" href="#" target="_blank" rel="noopener">Hablar con ALVEO por WhatsApp <span aria-hidden="true">↗</span></a>
					<button class="alveo-an-again" type="button" data-slot="again">Analizar otra web</button>
				</div>
			</div>
		</section>
	</div>
</div>
