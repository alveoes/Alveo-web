import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleArrowDown,
  Instagram,
  Menu,
  MessageCircle,
  Minus,
  Plus,
  X,
} from "lucide-react";

const navItems = [
  ["Problema", "#problema"],
  ["Servicios", "#servicios"],
  ["Proceso", "#proceso"],
  ["Portfolio", "#portfolio"],
  ["Sobre ALVEO", "#sobre-alveo"],
  ["Contacto", "#contacto"],
];

const services = [
  ["01", "Redes sociales", "Estrategia y gestión de contenido para Instagram, TikTok y otras plataformas."],
  ["02", "Creación de contenido", "Reels, vídeos cortos, fotografías, diseños y contenido pensado para captar atención."],
  ["03", "Google Business Profile", "Optimización de la ficha de Google para mejorar la visibilidad local."],
  ["04", "SEO local", "Optimización básica para ayudar a que los clientes encuentren el negocio cuando buscan servicios cercanos."],
  ["05", "Reseñas", "Estrategias para conseguir más reseñas y mejorar la reputación online."],
  ["06", "Promociones", "Ideas y campañas para convertir seguidores y visitas online en clientes reales."],
];

const problemCards = [
  ["Poca visibilidad", "Tu negocio no aparece delante de suficientes personas."],
  ["Redes sin estrategia", "Publicar por publicar no genera necesariamente clientes."],
  ["Google desaprovechado", "Tu presencia en Google puede ser una fuente constante de nuevos clientes."],
];

const footerLinks = [
  ["Inicio", "#inicio"],
  ["Servicios", "#servicios"],
  ["Proceso", "#proceso"],
  ["Portfolio", "#portfolio"],
  ["Sobre nosotros", "#sobre-alveo"],
  ["Contacto", "#contacto"],
];

function useReveal() {
  useEffect(() => {
    const items = document.querySelectorAll<HTMLElement>("[data-reveal]");
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("alveo-visible");
          observer.unobserve(entry.target);
        }
      }),
      { threshold: 0.12 },
    );
    items.forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, []);
}

function Mark({ inverse = false }: { inverse?: boolean }) {
  return <span className={`alveo-mark ${inverse ? "alveo-mark-inverse" : ""}`} aria-hidden="true"><i /><i /><i /></span>;
}

export function ALVEO() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [openService, setOpenService] = useState<number | null>(null);
  useReveal();

  useEffect(() => {
    document.title = "ALVEO — Haz que tu negocio sea visible.";
    const meta = document.querySelector('meta[name="description"]') ?? document.createElement("meta");
    meta.setAttribute("name", "description");
    meta.setAttribute("content", "Impulsamos la presencia digital de negocios locales mediante contenido, redes sociales y estrategias de marketing local.");
    if (!meta.parentNode) document.head.appendChild(meta);
  }, []);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSent(true);
  };

  return (
    <main className="alveo-page">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Manrope:wght@400;500;600;700;800&display=swap');
        .alveo-page{--ink:#171717;--paper:#f7f7f4;--line:#d9d9d2;--muted:#6c6c67;--soft:#ecece6;--lime:#d7f45e;background:var(--paper);color:var(--ink);font-family:Manrope,system-ui,sans-serif;overflow:hidden}
        .alveo-page *{box-sizing:border-box}.alveo-page a{color:inherit;text-decoration:none}.alveo-page button,.alveo-page input,.alveo-page textarea{font:inherit}.alveo-page button{cursor:pointer}
        .alveo-shell{max-width:1240px;margin:auto;padding:0 24px}.alveo-nav{height:78px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line)}
        .alveo-logo{font-weight:800;letter-spacing:-.08em;font-size:22px;display:flex;align-items:center;gap:8px}.alveo-mark{display:inline-flex;gap:2px;align-items:flex-end;height:17px}.alveo-mark i{display:block;width:3px;background:currentColor;border-radius:3px}.alveo-mark i:nth-child(1){height:7px}.alveo-mark i:nth-child(2){height:12px}.alveo-mark i:nth-child(3){height:17px}
        .alveo-navlinks{display:flex;gap:25px;font-size:12px;color:#555550}.alveo-navlinks a:hover{color:var(--ink)}.alveo-menu{display:none;background:none;border:0;padding:7px}
        .alveo-btn{border:1px solid var(--ink);border-radius:999px;display:inline-flex;align-items:center;justify-content:center;gap:10px;padding:14px 21px;font-size:12px;font-weight:700;transition:transform .25s,background .25s,color .25s}.alveo-btn:hover{transform:translateY(-2px);background:var(--ink);color:var(--paper)}.alveo-btn-dark{background:var(--ink);color:#f7f7f4!important}.alveo-btn-dark:hover{background:#3d3d3a;color:#f7f7f4!important}.alveo-btn-lime{background:var(--lime);border-color:var(--lime)}.alveo-btn-lime:hover{background:var(--paper);color:var(--ink);border-color:var(--paper)}
        .alveo-kicker{font:11px 'DM Mono',monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}.alveo-display{font-size:clamp(53px,8.4vw,112px);line-height:.92;letter-spacing:-.075em;font-weight:700;margin:0}.alveo-display em{font-style:normal;color:#9b9b92}
        .alveo-hero{min-height:720px;display:grid;grid-template-columns:1.2fr .8fr;align-items:center;gap:50px;padding:90px 0 110px}.alveo-hero-copy{max-width:690px}.alveo-hero-copy .alveo-kicker{margin-bottom:30px}.alveo-hero-copy p{font-size:17px;line-height:1.65;color:#51514c;max-width:485px;margin:34px 0 34px}.alveo-hero-actions{display:flex;gap:10px;flex-wrap:wrap}.alveo-orbit{width:min(100%,480px);aspect-ratio:1;position:relative;margin-left:auto;display:grid;place-items:center}.alveo-orbit:before,.alveo-orbit:after{content:"";position:absolute;border:1px solid #cfcfc7;border-radius:50%;inset:11%;transform:rotate(-24deg)}.alveo-orbit:after{inset:23%;transform:rotate(62deg);border-color:#bcbcb3}.alveo-orbit-core{width:43%;aspect-ratio:1;background:var(--ink);border-radius:50%;display:grid;place-items:center;color:var(--paper);font-size:11px;letter-spacing:.1em;text-transform:uppercase;text-align:center;z-index:1}.alveo-dot{position:absolute;width:12px;height:12px;background:var(--lime);border:3px solid var(--paper);border-radius:50%;z-index:2}.alveo-dot-a{top:16%;right:18%}.alveo-dot-b{bottom:17%;left:14%}.alveo-dot-c{bottom:9%;right:29%;background:var(--ink)}
        .alveo-scroll{display:flex;align-items:center;gap:9px;color:var(--muted);font:10px 'DM Mono',monospace;text-transform:uppercase;letter-spacing:.1em;margin-top:75px}.alveo-scroll svg{width:14px}
        .alveo-band{background:var(--ink);color:var(--paper);padding:105px 0}.alveo-band .alveo-kicker{color:#9f9f98}.alveo-problem{display:grid;grid-template-columns:1fr 1fr;gap:80px}.alveo-problem h2{font-size:clamp(33px,5vw,62px);line-height:1.02;letter-spacing:-.065em;margin:24px 0 0;max-width:520px}.alveo-problem-copy{padding-top:53px;color:#bcbcb4;line-height:1.6;max-width:355px}
        .alveo-problem-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:#44443f;margin-top:75px}.alveo-problem-card{background:var(--ink);padding:25px 20px;min-height:145px}.alveo-problem-card b{display:block;color:var(--lime);font:11px 'DM Mono',monospace;margin-bottom:34px}.alveo-problem-card h3{font-size:15px;margin:0 0 8px;font-weight:600}.alveo-problem-card p{font-size:12px;line-height:1.5;color:#aaa9a1;margin:0}
        .alveo-section{padding:130px 0}.alveo-section-head{display:flex;justify-content:space-between;align-items:flex-end;gap:30px;margin-bottom:54px}.alveo-section h2{font-size:clamp(39px,6vw,75px);line-height:.94;letter-spacing:-.07em;margin:15px 0 0}.alveo-section-intro{max-width:275px;font-size:14px;color:var(--muted);line-height:1.55}
        .alveo-service-list{border-top:1px solid var(--line)}.alveo-service{border-bottom:1px solid var(--line)}.alveo-service-main{display:grid;grid-template-columns:70px 1fr 280px 24px;align-items:center;gap:20px;padding:27px 0}.alveo-service-no{font:11px 'DM Mono',monospace;color:var(--muted)}.alveo-service h3{font-size:clamp(18px,2.2vw,26px);letter-spacing:-.04em;margin:0}.alveo-service p{font-size:12px;line-height:1.5;color:var(--muted);margin:0}.alveo-service button{border:0;background:none;color:var(--muted)}.alveo-service-detail{padding:0 70px 25px;color:var(--muted);font-size:13px;line-height:1.6;display:none}.alveo-service-detail.open{display:block}
        .alveo-process-wrap{background:var(--soft);padding:85px 0}.alveo-process-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;margin-top:55px;background:var(--line)}.alveo-process{background:var(--soft);padding:25px 20px 35px;min-height:190px}.alveo-process b{font:12px 'DM Mono',monospace;color:var(--muted)}.alveo-process h3{font-size:23px;margin:45px 0 10px;letter-spacing:-.05em}.alveo-process p{font-size:12px;line-height:1.5;color:var(--muted);margin:0}
        .alveo-portfolio{padding-bottom:135px}.alveo-portfolio-grid{display:grid;grid-template-columns:1.45fr 1fr 1fr;gap:13px}.alveo-project{aspect-ratio:1.08;background:#e6e6df;border-radius:8px;padding:18px;display:flex;flex-direction:column;justify-content:space-between;transition:transform .3s}.alveo-project:hover{transform:translateY(-5px)}.alveo-project:nth-child(2){background:#dcdcd3;margin-top:35px}.alveo-project:nth-child(3){background:#cfcfc7;margin-top:70px}.alveo-project-no{font:10px 'DM Mono',monospace;color:#6c6c67}.alveo-project span{font-size:17px;letter-spacing:-.05em}.alveo-project-plus{font-size:36px;font-weight:300}
        .alveo-about{background:var(--lime);padding:125px 0}.alveo-about-grid{display:grid;grid-template-columns:1fr 1fr;gap:90px}.alveo-about h2{font-size:clamp(38px,5vw,66px);line-height:.98;letter-spacing:-.07em;margin:18px 0}.alveo-about p{max-width:460px;line-height:1.65;color:#3e4225;margin:0}.alveo-about-list{border-top:1px solid #aabd52}.alveo-about-item{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #aabd52;padding:21px 0;font-size:23px;letter-spacing:-.04em}.alveo-about-item span{font:11px 'DM Mono',monospace}
        .alveo-contact{padding:130px 0}.alveo-contact-grid{display:grid;grid-template-columns:.82fr 1.18fr;gap:100px}.alveo-contact h2{font-size:clamp(40px,5.4vw,72px);line-height:.95;letter-spacing:-.07em;margin:18px 0 25px}.alveo-contact-copy p{font-size:14px;line-height:1.6;color:var(--muted);max-width:300px}.alveo-contact-links{display:flex;gap:17px;margin-top:36px}.alveo-contact-links a{font:11px 'DM Mono',monospace;border-bottom:1px solid var(--ink);padding-bottom:4px}.alveo-form{display:grid;grid-template-columns:1fr 1fr;gap:17px 13px}.alveo-field{display:flex;flex-direction:column;gap:8px}.alveo-field-full{grid-column:1/-1}.alveo-field label{font:10px 'DM Mono',monospace;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}.alveo-field input,.alveo-field textarea{border:0;border-bottom:1px solid var(--line);background:transparent;padding:11px 0;outline:none;border-radius:0;color:var(--ink)}.alveo-field input:focus,.alveo-field textarea:focus{border-color:var(--ink);box-shadow:0 2px 0 var(--ink)}.alveo-field textarea{min-height:100px;resize:vertical}.alveo-form button{justify-self:start;margin-top:10px}.alveo-success{grid-column:1/-1;display:flex;gap:10px;align-items:center;background:#e4f3ae;padding:15px;font-size:13px;border-radius:6px}.alveo-success svg{width:17px}
        .alveo-footer{background:var(--ink);color:var(--paper);padding:34px 0}.alveo-footer-top{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #42423e;padding-bottom:35px}.alveo-footer .alveo-logo{font-size:28px}.alveo-footer nav{display:flex;gap:24px;font-size:12px;color:#b8b8b1}.alveo-footer-bottom{display:flex;justify-content:space-between;padding-top:22px;color:#8d8d86;font:10px 'DM Mono',monospace}.alveo-footer .alveo-mark{color:var(--lime)}
        [data-reveal]{opacity:0;transform:translateY(22px);transition:opacity .7s ease,transform .7s ease}.alveo-visible{opacity:1;transform:translateY(0)}
        @media(max-width:760px){.alveo-shell{padding:0 20px}.alveo-nav{height:70px}.alveo-navlinks,.alveo-nav-cta{display:none}.alveo-menu{display:block;color:var(--ink)}.alveo-menu-open{position:absolute;z-index:10;top:70px;left:0;right:0;background:var(--paper);border-bottom:1px solid var(--line);padding:18px 20px;display:flex;flex-direction:column;gap:18px}.alveo-menu-open a{font-size:15px}.alveo-hero{display:block;padding:73px 0 60px;min-height:auto}.alveo-hero-copy p{font-size:15px;margin:28px 0}.alveo-orbit{width:90%;margin:68px auto 15px}.alveo-scroll{margin-top:46px}.alveo-band{padding:75px 0}.alveo-problem{display:block}.alveo-problem-copy{padding-top:35px}.alveo-problem-cards{grid-template-columns:1fr;margin-top:50px}.alveo-problem-card{min-height:125px}.alveo-problem-card b{margin-bottom:20px}.alveo-section{padding:82px 0}.alveo-section-head{display:block;margin-bottom:37px}.alveo-section-intro{margin-top:25px}.alveo-service-main{grid-template-columns:35px 1fr 20px;gap:12px;padding:22px 0}.alveo-service p{display:none}.alveo-service-detail{padding:0 47px 22px}.alveo-process-wrap{padding:70px 0}.alveo-process-grid{grid-template-columns:1fr 1fr;margin-top:35px}.alveo-process{min-height:160px;padding:19px 15px}.alveo-process h3{margin-top:31px;font-size:20px}.alveo-portfolio{padding-bottom:85px}.alveo-portfolio-grid{grid-template-columns:1fr 1fr;gap:10px}.alveo-project:first-child{grid-column:1/-1;aspect-ratio:1.55}.alveo-project:nth-child(2),.alveo-project:nth-child(3){margin-top:0}.alveo-about{padding:80px 0}.alveo-about-grid{display:block}.alveo-about-list{margin-top:60px}.alveo-about-item{font-size:20px}.alveo-contact{padding:82px 0}.alveo-contact-grid{display:block}.alveo-form{margin-top:60px;display:block}.alveo-field{margin-bottom:20px}.alveo-form button{width:100%;margin-top:5px}.alveo-footer-top{display:block}.alveo-footer nav{flex-wrap:wrap;margin-top:30px;gap:15px}.alveo-footer-bottom{display:block;line-height:1.8}.alveo-footer-bottom span{display:block}.alveo-btn{min-height:48px}.alveo-display{font-size:clamp(50px,15vw,75px)}}
        @media(prefers-reduced-motion:reduce){[data-reveal]{opacity:1;transform:none;transition:none}.alveo-btn,.alveo-project{transition:none}}
      `}</style>

      <header className="alveo-shell">
        <nav className="alveo-nav" aria-label="Navegación principal">
          <a className="alveo-logo" href="#inicio" aria-label="ALVEO inicio">ALVEO <Mark /></a>
          <div className={menuOpen ? "alveo-navlinks alveo-menu-open" : "alveo-navlinks"}>
            {navItems.map(([label, href]) => <a key={href} href={href} onClick={() => setMenuOpen(false)}>{label}</a>)}
          </div>
          <a className="alveo-btn alveo-nav-cta" href="#contacto">Hablar con ALVEO <ArrowUpRight size={14} /></a>
          <button className="alveo-menu" onClick={() => setMenuOpen(!menuOpen)} aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"} aria-expanded={menuOpen}>{menuOpen ? <X size={22} /> : <Menu size={22} />}</button>
        </nav>
      </header>

      <section id="inicio" className="alveo-shell alveo-hero" data-reveal>
        <div className="alveo-hero-copy">
           <div className="alveo-kicker">ALVEO / Agencia de marketing local</div>
          <h1 className="alveo-display">Haz que tu negocio <em>sea visible.</em></h1>
          <p>Impulsamos la presencia digital de negocios locales mediante contenido, redes sociales y estrategias de marketing local.</p>
          <div className="alveo-hero-actions"><a className="alveo-btn alveo-btn-dark" href="#contacto">Quiero mejorar mi negocio <ArrowUpRight size={15} /></a><a className="alveo-btn" href="#servicios">Ver servicios</a></div>
          <div className="alveo-scroll"><CircleArrowDown size={15} /> Baja para conocer ALVEO</div>
        </div>
        <div className="alveo-orbit" aria-hidden="true"><div className="alveo-orbit-core">negocio<br />local</div><i className="alveo-dot alveo-dot-a" /><i className="alveo-dot alveo-dot-b" /><i className="alveo-dot alveo-dot-c" /></div>
      </section>

      <section id="problema" className="alveo-band" data-reveal>
        <div className="alveo-shell"><div className="alveo-problem"><div><div className="alveo-kicker">El punto de partida</div><h2>Tu negocio puede ser bueno. Pero si nadie lo encuentra, no importa.</h2></div><p className="alveo-problem-copy">La visibilidad no ocurre por accidente. Ocurre cuando cada punto de contacto —desde una búsqueda hasta una publicación— trabaja para tu negocio.</p></div>
           <div className="alveo-problem-cards">{problemCards.map(([title, copy], i) => <div className="alveo-problem-card" key={title}><b>0{i + 1}</b><h3>{title}</h3><p>{copy}</p></div>)}</div>
        </div>
      </section>

      <section id="servicios" className="alveo-shell alveo-section" data-reveal>
        <div className="alveo-section-head"><div><div className="alveo-kicker">Lo que hacemos</div><h2>Servicios que<br /><em>mueven</em> negocio.</h2></div><p className="alveo-section-intro">Lo importante no es estar en todas partes. Es estar donde tus clientes te están buscando.</p></div>
        <div className="alveo-service-list">{services.map(([no, title, desc], i) => <div className="alveo-service" key={title}><div className="alveo-service-main"><span className="alveo-service-no">{no}</span><h3>{title}</h3><p>{desc}</p><button aria-label={`${openService === i ? "Cerrar" : "Ver"} ${title}`} onClick={() => setOpenService(openService === i ? null : i)}>{openService === i ? <Minus size={18} /> : <Plus size={18} />}</button></div><div className={`alveo-service-detail ${openService === i ? "open" : ""}`}>{desc} Trabajamos contigo para convertirlo en una presencia digital que se entiende, se encuentra y se recuerda.</div></div>)}</div>
      </section>

       <section id="proceso" className="alveo-process-wrap" data-reveal><div className="alveo-shell"><div className="alveo-kicker">Cómo trabajamos</div><div className="alveo-process-grid">{[["01","Analizamos","Estudiamos el negocio, su presencia online y su competencia."],["02","Planificamos","Creamos una estrategia adaptada al negocio y a sus objetivos."],["03","Creamos","Producimos contenido y optimizamos sus canales digitales."],["04","Mejoramos","Analizamos los resultados y seguimos optimizando la estrategia."]].map(([no,title,desc]) => <div className="alveo-process" key={no}><b>{no}</b><h3>{title}</h3><p>{desc}</p></div>)}</div></div></section>

      <section id="portfolio" className="alveo-shell alveo-section alveo-portfolio" data-reveal><div className="alveo-section-head"><div><div className="alveo-kicker">Trabajo en curso</div><h2>Portfolio<br /><em>próximamente.</em></h2></div><a className="alveo-btn" href="#contacto">Ver portfolio completo <ArrowUpRight size={14} /></a></div><div className="alveo-portfolio-grid">{[1,2,3].map((n) => <div className="alveo-project" key={n}><span className="alveo-project-no">0{n} / ALVEO</span><span>Próximo proyecto <b className="alveo-project-plus">+</b></span></div>)}</div></section>

      <section id="sobre-alveo" className="alveo-about" data-reveal><div className="alveo-shell alveo-about-grid"><div><div className="alveo-kicker">Sobre ALVEO</div><h2>No queremos que publiques más. Queremos que publiques mejor.</h2><p>ALVEO nace con una idea sencilla: ayudar a los negocios locales a aprovechar de verdad Internet para conseguir visibilidad, confianza y clientes.</p></div><div className="alveo-about-list">{["Contenido","Estrategia","Visibilidad","Clientes"].map((item, i) => <div className="alveo-about-item" key={item}><span>0{i+1}</span>{item}<ChevronRight size={20} /></div>)}</div></div></section>

       <section id="contacto" className="alveo-shell alveo-contact" data-reveal><div className="alveo-contact-grid"><div className="alveo-contact-copy"><div className="alveo-kicker">Hablemos</div><h2>¿Preparado para hacer que tu negocio sea más visible?</h2><p>Cuéntanos qué haces y analizaremos cómo podemos ayudarte.</p><div className="alveo-contact-links"><a href="#contacto" aria-label="Instagram — enlace pendiente"><Instagram size={13} /> Instagram</a><a href="#contacto" aria-label="WhatsApp — enlace pendiente"><MessageCircle size={13} /> WhatsApp</a><a href="#contacto" aria-label="Email — enlace pendiente"><ArrowUpRight size={13} /> Email</a></div></div><form className="alveo-form" onSubmit={handleSubmit}>{sent && <div className="alveo-success"><Check size={17} /> Mensaje preparado. Este formulario queda listo para conectar con un servicio de email.</div>} {[["Nombre","Tu nombre","text"],["Negocio","Nombre de tu negocio","text"],["Email","tu@email.com","email"],["Teléfono","Tu teléfono","tel"]].map(([label,placeholder,type]) => <div className="alveo-field" key={label}><label htmlFor={label}>{label}</label><input id={label} name={label} placeholder={placeholder} type={type} required={label !== "Teléfono"} /></div>)}<div className="alveo-field alveo-field-full"><label htmlFor="Mensaje">Mensaje</label><textarea id="Mensaje" name="Mensaje" placeholder="Cuéntanos un poco sobre tu negocio..." required /></div><button className="alveo-btn alveo-btn-dark" type="submit">Enviar mensaje <ArrowUpRight size={14} /></button></form></div></section>

       <footer className="alveo-footer"><div className="alveo-shell"><div className="alveo-footer-top"><a className="alveo-logo" href="#inicio">ALVEO <Mark inverse /></a><nav aria-label="Navegación de pie">{footerLinks.map(([label,href]) => <a key={href} href={href}>{label}</a>)}</nav></div><div className="alveo-footer-bottom"><span>Marketing digital para negocios locales.</span><span>© 2026 ALVEO. Todos los derechos reservados.</span></div></div></footer>
    </main>
  );
}