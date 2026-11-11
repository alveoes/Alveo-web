<?php
/**
 * Resultados del análisis. Variables: $r (resultado), $wa (número WhatsApp).
 * Todo lo que procede de la web analizada se escapa con esc_html / esc_attr.
 *
 * @package alveo-analizador
 */

defined( 'ABSPATH' ) || exit;

$alveo_meses = array( 1 => 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre' );
$alveo_now   = current_datetime();
$alveo_fecha = $alveo_now->format( 'j' ) . ' de ' . $alveo_meses[ (int) $alveo_now->format( 'n' ) ] . ' de ' . $alveo_now->format( 'Y' ) . ' a las ' . $alveo_now->format( 'H:i' );

$alveo_n      = count( $r['improvements'] );
$alveo_titles = array(
	0 => 'No hemos detectado mejoras urgentes',
	1 => 'La mejora más importante',
	2 => 'Las 2 mejoras más importantes',
	3 => 'Las 3 mejoras más importantes',
);
$alveo_wa_url = '';
if ( strlen( $wa ) >= 9 ) {
	$alveo_msg    = 'Hola ALVEO, he analizado mi web (' . $r['url'] . ') con vuestro analizador y me gustaría que la revisarais conmigo.';
	$alveo_wa_url = 'https://wa.me/' . $wa . '?text=' . rawurlencode( $alveo_msg );
}
?>
<section class="alveo-an-band alveo-an-summary">
	<div class="alveo-an-shell">
		<p class="alveo-an-kicker">Diagnóstico de</p>
		<p class="alveo-an-site"><?php echo esc_html( $r['site'] ); ?></p>
		<p class="alveo-an-meta">Analizada el <?php echo esc_html( $alveo_fecha ); ?> · <?php echo (int) $r['checked']; ?> comprobaciones sobre el código de la página</p>
		<?php if ( $r['notices'] ) : ?>
			<div class="alveo-an-notice"><?php foreach ( $r['notices'] as $alveo_notice ) : ?><p><?php echo esc_html( $alveo_notice ); ?></p><?php endforeach; ?></div>
		<?php endif; ?>
	</div>
</section>

<section class="alveo-an-lime">
	<div class="alveo-an-shell">
		<p class="alveo-an-kicker">Por dónde empezar</p>
		<h3 class="alveo-an-h"><?php echo esc_html( $alveo_titles[ $alveo_n ] ); ?></h3>
		<?php if ( $alveo_n ) : ?>
			<ol class="alveo-an-list">
				<?php foreach ( $r['improvements'] as $alveo_imp ) : ?>
					<li>
						<div><h4><?php echo esc_html( $alveo_imp['title'] ); ?></h4><span class="alveo-an-area"><?php echo esc_html( $alveo_imp['area'] ); ?></span></div>
						<div><p><?php echo esc_html( $alveo_imp['text'] ); ?></p><span class="alveo-an-evidence"><?php echo esc_html( $alveo_imp['evidence'] ); ?></span></div>
					</li>
				<?php endforeach; ?>
			</ol>
		<?php endif; ?>
		<?php if ( 0 === $alveo_n ) : ?>
			<p class="alveo-an-none">En lo que hemos podido comprobar automáticamente tu web está bien preparada. Aun así, en una revisión personalizada podemos encontrar oportunidades en tu ficha de Google, tus redes y tus mensajes.</p>
		<?php elseif ( $alveo_n < 3 ) : ?>
			<p class="alveo-an-none" style="margin-top:26px">Solo te mostramos los problemas que hemos detectado de verdad en tu página.</p>
		<?php endif; ?>
	</div>
</section>

<?php if ( $r['strengths'] ) : ?>
<section class="alveo-an-good">
	<div class="alveo-an-shell">
		<p class="alveo-an-kicker">Lo que ya haces bien</p>
		<ul class="alveo-an-chips">
			<?php foreach ( array_slice( $r['strengths'], 0, 10 ) as $alveo_s ) : ?>
				<li title="<?php echo esc_attr( $alveo_s['evidence'] ); ?>"><?php echo esc_html( $alveo_s['label'] ); ?></li>
			<?php endforeach; ?>
		</ul>
	</div>
</section>
<?php endif; ?>

<section class="alveo-an-band alveo-an-cta">
	<div class="alveo-an-shell alveo-an-cta-grid">
		<div>
			<p class="alveo-an-kicker">Siguiente paso</p>
			<h3 class="alveo-an-h">¿Lo mejoramos juntos?</h3>
			<p>Este análisis es automático. Escríbenos por WhatsApp y el equipo de ALVEO revisará tu web contigo, sin compromiso.</p>
		</div>
		<div class="alveo-an-cta-actions">
			<?php if ( $alveo_wa_url ) : ?>
				<a class="alveo-an-btn alveo-an-btn-lime" href="<?php echo esc_url( $alveo_wa_url ); ?>" target="_blank" rel="noopener">Hablar con ALVEO por WhatsApp <span aria-hidden="true">↗</span></a>
			<?php endif; ?>
			<a class="alveo-an-again" href="#alveo-analizador" data-again>Analizar otra web</a>
		</div>
	</div>
</section>
