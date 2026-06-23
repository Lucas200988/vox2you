import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Fórum Mato-Grossense de Engenharia Elétrica e Energias Sustentáveis 2026",
  description:
    "Media Kit — Battery Energy Storage Systems (BESS). Captação de patrocinadores. Cuiabá 28/09/2026 · Rondonópolis 30/09/2026.",
};

export default function ForumPage() {
  return (
    <>
      {/* ─── Google Fonts ─── */}
      <link
        href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;800;900&family=Inter:wght@300;400;500;600;700&display=swap"
        rel="stylesheet"
      />

      <main
        style={{
          fontFamily: "'Montserrat', 'Inter', system-ui, sans-serif",
          background: "#0D1B2A",
          color: "#fff",
          overflowX: "hidden",
        }}
      >
        {/* ═══════════════════════════════════════════════════════════
            SLIDE 1 — CAPA
        ═══════════════════════════════════════════════════════════ */}
        <section
          style={{
            position: "relative",
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
            overflow: "hidden",
          }}
        >
          {/* Background image */}
          <img
            src="https://images.unsplash.com/photo-1509391366360-2e959784a276?w=1920&q=85&fit=crop"
            alt="BESS container system with solar farm"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: "center",
              filter: "brightness(0.4) saturate(0.8)",
            }}
          />
          {/* Gradient overlay */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(180deg, rgba(13,27,42,0.3) 0%, rgba(8,42,67,0.6) 50%, rgba(13,27,42,0.97) 100%)",
            }}
          />
          {/* Accent line */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: 4,
              background: "linear-gradient(90deg, #00C853, #00E676, #00C853)",
            }}
          />

          {/* Top logos */}
          <div
            style={{
              position: "absolute",
              top: 40,
              left: 0,
              right: 0,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "0 60px",
              zIndex: 10,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: "50%",
                  border: "2px solid rgba(0,200,83,0.7)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  fontWeight: 800,
                  color: "#00C853",
                  letterSpacing: 1,
                  background: "rgba(0,200,83,0.08)",
                }}
              >
                AMEE
              </div>
              <div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", letterSpacing: 3, textTransform: "uppercase" }}>Organização</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.9)" }}>Associação Mato-grossense dos<br />Engenheiros Eletricistas</div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", letterSpacing: 3, textTransform: "uppercase", textAlign: "right" }}>Apoio Institucional</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.9)", textAlign: "right" }}>CREA-MT</div>
              </div>
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: "50%",
                  border: "2px solid rgba(255,255,255,0.3)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  fontWeight: 800,
                  color: "rgba(255,255,255,0.8)",
                  background: "rgba(255,255,255,0.05)",
                  letterSpacing: 0.5,
                }}
              >
                CREA
              </div>
            </div>
          </div>

          {/* Hero content */}
          <div
            style={{
              position: "relative",
              zIndex: 10,
              padding: "80px 60px 100px",
              maxWidth: 900,
            }}
          >
            <div
              style={{
                display: "inline-block",
                background: "rgba(0,200,83,0.12)",
                border: "1px solid rgba(0,200,83,0.4)",
                borderRadius: 2,
                padding: "6px 16px",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 4,
                textTransform: "uppercase",
                color: "#00C853",
                marginBottom: 24,
              }}
            >
              Media Kit · Captação de Patrocinadores
            </div>
            <h1
              style={{
                fontSize: "clamp(36px, 6vw, 72px)",
                fontWeight: 900,
                lineHeight: 1.05,
                letterSpacing: -1,
                marginBottom: 16,
                color: "#fff",
              }}
            >
              FÓRUM MATO-GROSSENSE<br />
              <span style={{ color: "#00C853" }}>DE ENGENHARIA ELÉTRICA</span><br />
              E ENERGIAS SUSTENTÁVEIS
            </h1>
            <p
              style={{
                fontSize: "clamp(18px, 2.5vw, 28px)",
                fontWeight: 300,
                color: "rgba(255,255,255,0.7)",
                marginBottom: 48,
                letterSpacing: 2,
                textTransform: "uppercase",
              }}
            >
              Battery Energy Storage Systems — BESS
            </p>
            <div style={{ display: "flex", gap: 40, flexWrap: "wrap" }}>
              <DateChip day="28" month="SET" year="2026" city="Cuiabá" />
              <DateChip day="30" month="SET" year="2026" city="Rondonópolis" />
            </div>
          </div>

          {/* Scroll indicator */}
          <div
            style={{
              position: "absolute",
              bottom: 32,
              right: 60,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
              opacity: 0.5,
              zIndex: 10,
            }}
          >
            <div style={{ fontSize: 9, letterSpacing: 4, textTransform: "uppercase" }}>Scroll</div>
            <div style={{ width: 1, height: 40, background: "linear-gradient(180deg,#fff,transparent)" }} />
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════
            SLIDE 2 — MENSAGEM DO PRESIDENTE
        ═══════════════════════════════════════════════════════════ */}
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            minHeight: "100vh",
          }}
        >
          <div
            style={{
              position: "relative",
              overflow: "hidden",
            }}
          >
            <img
              src="https://images.unsplash.com/photo-1560179707-f14e90ef3623?w=900&q=85&fit=crop"
              alt="Presidente da AMEE"
              style={{ width: "100%", height: "100%", objectFit: "cover", filter: "grayscale(20%) brightness(0.85)" }}
            />
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg,transparent 60%,#082A43 100%)" }} />
          </div>
          <div
            style={{
              background: "#082A43",
              padding: "100px 80px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
            }}
          >
            <SectionLabel text="Slide 02" />
            <h2 style={{ fontSize: 13, fontWeight: 700, letterSpacing: 6, textTransform: "uppercase", color: "#00C853", marginBottom: 32 }}>
              Mensagem do Presidente
            </h2>
            <div
              style={{
                width: 40,
                height: 3,
                background: "linear-gradient(90deg,#00C853,#00E676)",
                marginBottom: 40,
                borderRadius: 2,
              }}
            />
            <p
              style={{
                fontSize: 17,
                lineHeight: 1.9,
                color: "rgba(255,255,255,0.8)",
                fontWeight: 300,
                fontStyle: "italic",
                marginBottom: 48,
              }}
            >
              "O armazenamento de energia é a espinha dorsal da transição energética. Mato Grosso, com seu imenso potencial solar e demanda crescente do agronegócio, está no epicentro desta revolução. O Fórum BESS 2026 nasce para conectar quem produz inovação com quem precisa dela."
            </p>
            <div>
              <div style={{ width: 48, height: 1, background: "#00C853", marginBottom: 16 }} />
              <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>Presidente da AMEE</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", letterSpacing: 2, marginTop: 4 }}>
                Associação Mato-grossense dos Engenheiros Eletricistas
              </div>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════
            SLIDE 3 — SOBRE O EVENTO
        ═══════════════════════════════════════════════════════════ */}
        <section
          style={{
            background: "#F4F6F8",
            color: "#0D1B2A",
            padding: "120px 80px",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div style={{ position: "absolute", top: -120, right: -120, width: 400, height: 400, borderRadius: "50%", background: "rgba(0,200,83,0.06)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", bottom: -80, left: -80, width: 300, height: 300, borderRadius: "50%", background: "rgba(8,42,67,0.05)", pointerEvents: "none" }} />

          <div style={{ maxWidth: 1200, margin: "0 auto" }}>
            <SectionLabel text="Slide 03" dark />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 80, alignItems: "start" }}>
              <div>
                <h2
                  style={{
                    fontSize: "clamp(32px, 4vw, 52px)",
                    fontWeight: 900,
                    lineHeight: 1.1,
                    color: "#082A43",
                    marginBottom: 24,
                  }}
                >
                  Sobre<br />o Evento
                </h2>
                <div style={{ width: 48, height: 4, background: "#00C853", borderRadius: 2, marginBottom: 32 }} />
                <p style={{ fontSize: 15, lineHeight: 1.8, color: "#4A5568", fontWeight: 400 }}>
                  O maior fórum técnico de engenharia elétrica do Centro-Oeste, com foco exclusivo em sistemas de armazenamento de energia em bateria.
                </p>
              </div>
              <div>
                {/* Timeline */}
                <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                  {[
                    { phase: "Fase 01", date: "Jul–Ago 2026", title: "Captação de Patrocínio", desc: "Abertura do processo comercial com apresentação do media kit para empresas parceiras." },
                    { phase: "Fase 02", date: "Ago–Set 2026", title: "Divulgação & Inscrições", desc: "Campanha integrada em redes sociais, email marketing, CREA-MT e universidades federais." },
                    { phase: "Fase 03", date: "28 Set 2026", title: "Cuiabá — Capital", desc: "Evento principal com palestras técnicas, painéis e área de exposição de tecnologias." },
                    { phase: "Fase 04", date: "30 Set 2026", title: "Rondonópolis — Polo Industrial", desc: "Extensão do fórum para o segundo maior polo econômico do estado." },
                  ].map((item, i) => (
                    <div
                      key={i}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "120px 1fr",
                        gap: 32,
                        paddingBottom: i < 3 ? 40 : 0,
                        paddingTop: i > 0 ? 0 : 0,
                      }}
                    >
                      <div style={{ textAlign: "right", paddingTop: 4 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 3, color: "#00C853", textTransform: "uppercase" }}>{item.phase}</div>
                        <div style={{ fontSize: 13, color: "#718096", marginTop: 4 }}>{item.date}</div>
                      </div>
                      <div
                        style={{
                          borderLeft: `2px solid ${i === 0 ? "#00C853" : "#E2E8F0"}`,
                          paddingLeft: 32,
                          paddingBottom: i < 3 ? 40 : 0,
                          position: "relative",
                        }}
                      >
                        <div
                          style={{
                            position: "absolute",
                            left: -7,
                            top: 6,
                            width: 12,
                            height: 12,
                            borderRadius: "50%",
                            background: i === 0 ? "#00C853" : "#CBD5E0",
                            border: `2px solid ${i === 0 ? "#00C853" : "#CBD5E0"}`,
                          }}
                        />
                        <div style={{ fontSize: 16, fontWeight: 700, color: "#082A43", marginBottom: 8 }}>{item.title}</div>
                        <div style={{ fontSize: 14, color: "#718096", lineHeight: 1.7 }}>{item.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════
            SLIDE 4 — POR QUE FALAR DE BESS?
        ═══════════════════════════════════════════════════════════ */}
        <section
          style={{
            background: "#0D1B2A",
            padding: "120px 80px",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <img
            src="https://images.unsplash.com/photo-1497435334941-8c899a9bd585?w=1400&q=70&fit=crop"
            alt="Energy grid"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              opacity: 0.08,
            }}
          />
          <div style={{ maxWidth: 1200, margin: "0 auto", position: "relative" }}>
            <SectionLabel text="Slide 04" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 80, alignItems: "center" }}>
              <div>
                <h2 style={{ fontSize: "clamp(28px, 3.5vw, 48px)", fontWeight: 900, lineHeight: 1.1, marginBottom: 24 }}>
                  Por que falar<br /><span style={{ color: "#00C853" }}>de BESS?</span>
                </h2>
                <div style={{ width: 48, height: 4, background: "#00C853", borderRadius: 2, marginBottom: 32 }} />
                <p style={{ fontSize: 15, lineHeight: 1.9, color: "rgba(255,255,255,0.65)", fontWeight: 300 }}>
                  O armazenamento em bateria é o elo que transforma energia solar intermitente em fornecimento confiável — habilitando o mercado livre, o peak shaving industrial e a resiliência das redes de distribuição.
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 40 }}>
                  {[
                    { v: "$262 bi", l: "Mercado global 2030 (proj.)" },
                    { v: "42%", l: "CAGR do setor 2023–2028" },
                    { v: "15 GWh", l: "Capacidade instalada BR 2025" },
                    { v: "R$ 8 bi", l: "Investimentos previstos no BR" },
                  ].map((s, i) => (
                    <div key={i} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "20px 24px" }}>
                      <div style={{ fontSize: 28, fontWeight: 900, color: "#00C853", lineHeight: 1 }}>{s.v}</div>
                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 8, lineHeight: 1.5 }}>{s.l}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Infográfico de fluxo */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0 }}>
                {[
                  { icon: "☀️", label: "Solar Fotovoltaico", color: "#FFC107" },
                  { icon: "⚡", label: "Inversor Híbrido", color: "#82B1FF" },
                  { icon: "🔋", label: "BESS — Armazenamento", color: "#00C853", highlight: true },
                  { icon: "🔌", label: "Rede Elétrica", color: "#80DEEA" },
                  { icon: "🏭", label: "Consumidor / Indústria", color: "#FFB74D" },
                  { icon: "📈", label: "Mercado Livre de Energia", color: "#CE93D8" },
                  { icon: "🛡️", label: "Backup & Resiliência", color: "#80CBC4" },
                ].map((node, i) => (
                  <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 16,
                        background: node.highlight ? "rgba(0,200,83,0.12)" : "rgba(255,255,255,0.04)",
                        border: `1px solid ${node.highlight ? "rgba(0,200,83,0.5)" : "rgba(255,255,255,0.08)"}`,
                        borderRadius: 10,
                        padding: "14px 28px",
                        minWidth: 280,
                        boxShadow: node.highlight ? "0 0 40px rgba(0,200,83,0.15)" : "none",
                      }}
                    >
                      <span style={{ fontSize: 22 }}>{node.icon}</span>
                      <span style={{ fontSize: 14, fontWeight: node.highlight ? 700 : 500, color: node.highlight ? "#00C853" : "rgba(255,255,255,0.8)" }}>
                        {node.label}
                      </span>
                    </div>
                    {i < 6 && (
                      <div style={{ width: 2, height: 20, background: "rgba(255,255,255,0.15)", borderRadius: 1 }} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════
            SLIDE 5 — MERCADO MUNDIAL
        ═══════════════════════════════════════════════════════════ */}
        <section
          style={{
            background: "#082A43",
            padding: "120px 80px",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div style={{ maxWidth: 1200, margin: "0 auto" }}>
            <SectionLabel text="Slide 05" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 80, alignItems: "center" }}>
              <div>
                <h2 style={{ fontSize: "clamp(28px, 3.5vw, 48px)", fontWeight: 900, lineHeight: 1.1, marginBottom: 16 }}>
                  Mercado<br /><span style={{ color: "#00C853" }}>Mundial BESS</span>
                </h2>
                <div style={{ width: 48, height: 4, background: "#00C853", borderRadius: 2, marginBottom: 32 }} />
                <p style={{ fontSize: 15, lineHeight: 1.9, color: "rgba(255,255,255,0.6)", marginBottom: 48 }}>
                  O mercado global de armazenamento em baterias está em trajetória exponencial, impulsionado pela descarbonização da matriz energética mundial e pela queda contínua dos custos de célula.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                  {[
                    { year: "2020", value: 14, label: "GWh instalados", color: "rgba(0,200,83,0.4)" },
                    { year: "2025", value: 58, label: "GWh instalados", color: "rgba(0,200,83,0.65)" },
                    { year: "2030", value: 100, label: "GWh instalados (projeção)", color: "#00C853" },
                  ].map((bar) => (
                    <div key={bar.year}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>{bar.year}</span>
                        <span style={{ fontSize: 13, color: "#00C853", fontWeight: 600 }}>{bar.label}</span>
                      </div>
                      <div style={{ background: "rgba(255,255,255,0.07)", borderRadius: 4, height: 10, overflow: "hidden" }}>
                        <div style={{ width: `${bar.value}%`, height: "100%", background: bar.color, borderRadius: 4 }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ position: "relative" }}>
                <img
                  src="https://images.unsplash.com/photo-1611365892117-00ac5ef43c90?w=800&q=85&fit=crop"
                  alt="Large-scale battery storage facility"
                  style={{ width: "100%", borderRadius: 12, filter: "brightness(0.85)" }}
                />
                <div style={{ position: "absolute", bottom: 24, left: 24, right: 24, background: "rgba(13,27,42,0.9)", backdropFilter: "blur(12px)", borderRadius: 8, padding: "20px 24px", border: "1px solid rgba(0,200,83,0.2)" }}>
                  <div style={{ fontSize: 11, letterSpacing: 3, textTransform: "uppercase", color: "#00C853", marginBottom: 8 }}>Projeção BNEF 2030</div>
                  <div style={{ fontSize: 24, fontWeight: 900, color: "#fff" }}>$262 bilhões</div>
                  <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>Valor total do mercado global</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════
            SLIDE 6 — MERCADO BRASILEIRO
        ═══════════════════════════════════════════════════════════ */}
        <section
          style={{
            background: "#F4F6F8",
            color: "#0D1B2A",
            padding: "120px 80px",
          }}
        >
          <div style={{ maxWidth: 1200, margin: "0 auto" }}>
            <SectionLabel text="Slide 06" dark />
            <div style={{ textAlign: "center", marginBottom: 80 }}>
              <h2 style={{ fontSize: "clamp(28px, 3.5vw, 48px)", fontWeight: 900, color: "#082A43", marginBottom: 16 }}>
                O Mercado <span style={{ color: "#00C853" }}>Brasileiro</span>
              </h2>
              <div style={{ width: 48, height: 4, background: "#00C853", borderRadius: 2, margin: "0 auto 24px" }} />
              <p style={{ fontSize: 15, color: "#718096", maxWidth: 560, margin: "0 auto", lineHeight: 1.8 }}>
                Seis verticais de mercado com demanda imediata por soluções BESS no Brasil
              </p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}>
              {[
                {
                  icon: "⚡",
                  title: "Geração Distribuída",
                  desc: "Mais de 30 GW instalados de GD solar com necessidade crítica de armazenamento para autoconsumo noturno.",
                  metric: "30+ GW",
                },
                {
                  icon: "📊",
                  title: "Mercado Livre",
                  desc: "Consumidores migrados ao mercado livre precisam de BESS para gestão de demanda e redução de tarifas.",
                  metric: "12.000+ consumidores",
                },
                {
                  icon: "🌾",
                  title: "Agronegócio",
                  desc: "Propriedades rurais remotas com alta irradiação solar e demanda por backup confiável.",
                  metric: "R$ 4 bi mercado",
                },
                {
                  icon: "🖥️",
                  title: "Data Centers",
                  desc: "UPS de longa duração e peak shaving com baterias de íon-lítio substituindo grupos geradores.",
                  metric: "150+ DCs no BR",
                },
                {
                  icon: "⛏️",
                  title: "Mineração",
                  desc: "Minas em localidades remotas substituindo diesel por BESS + solar, com ROI inferior a 3 anos.",
                  metric: "$1,2 bi oportunidade",
                },
                {
                  icon: "🏥",
                  title: "Hospitais & Indústrias",
                  desc: "Continuidade de operação crítica com BESS de alta potência como substituto de grupos geradores.",
                  metric: "2.500+ hospitais",
                },
              ].map((card, i) => (
                <div
                  key={i}
                  style={{
                    background: "#fff",
                    borderRadius: 12,
                    padding: "40px 32px",
                    borderBottom: "4px solid transparent",
                    borderImage: "linear-gradient(90deg,#00C853,#00E676) 1",
                    boxShadow: "0 4px 24px rgba(8,42,67,0.08)",
                    transition: "transform 0.2s",
                  }}
                >
                  <div style={{ fontSize: 32, marginBottom: 16 }}>{card.icon}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#00C853", letterSpacing: 2, textTransform: "uppercase", marginBottom: 12 }}>{card.metric}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#082A43", marginBottom: 12 }}>{card.title}</div>
                  <div style={{ fontSize: 14, color: "#718096", lineHeight: 1.7 }}>{card.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════
            SLIDE 7 — POR QUE MATO GROSSO?
        ═══════════════════════════════════════════════════════════ */}
        <section style={{ position: "relative", minHeight: "80vh", display: "flex", alignItems: "center", overflow: "hidden" }}>
          <img
            src="https://images.unsplash.com/photo-1574873252157-bc45eba4dc42?w=1600&q=80&fit=crop"
            alt="Aerial view of solar farm in Mato Grosso"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", filter: "brightness(0.35) saturate(0.7)" }}
          />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, rgba(8,42,67,0.9) 0%, rgba(13,27,42,0.7) 100%)" }} />
          <div style={{ position: "relative", zIndex: 10, padding: "100px 80px", width: "100%", maxWidth: 1200, margin: "0 auto" }}>
            <SectionLabel text="Slide 07" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 80 }}>
              <div>
                <h2 style={{ fontSize: "clamp(28px, 3.5vw, 48px)", fontWeight: 900, lineHeight: 1.1, marginBottom: 16 }}>
                  Por que<br /><span style={{ color: "#00C853" }}>Mato Grosso?</span>
                </h2>
                <div style={{ width: 48, height: 4, background: "#00C853", borderRadius: 2, marginBottom: 32 }} />
                <p style={{ fontSize: 15, color: "rgba(255,255,255,0.7)", lineHeight: 1.9, marginBottom: 40 }}>
                  O maior produtor de grãos do Brasil é também um dos estados com maior irradiação solar do país — e um dos maiores consumidores de energia do Centro-Oeste.
                </p>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                {[
                  { v: "6,0", u: "kWh/m²/dia", l: "Irradiação média" },
                  { v: "#1", u: "BR", l: "Produtor de soja" },
                  { v: "3,6 GW", u: "instalados", l: "Capacidade solar MT" },
                  { v: "12 mi", u: "hab.", l: "Polo de consumo" },
                  { v: "R$ 189 bi", u: "PIB", l: "Agronegócio MT" },
                  { v: "120+", u: "subestações", l: "Rede elétrica MT" },
                ].map((s, i) => (
                  <div key={i} style={{ background: "rgba(255,255,255,0.05)", borderRadius: 10, padding: "24px 20px", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <div style={{ fontSize: 26, fontWeight: 900, color: "#00C853", lineHeight: 1 }}>{s.v}</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontWeight: 500, marginTop: 2 }}>{s.u}</div>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginTop: 8 }}>{s.l}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════
            SLIDE 8 — TEMAS
        ═══════════════════════════════════════════════════════════ */}
        <section style={{ background: "#0D1B2A", padding: "120px 80px" }}>
          <div style={{ maxWidth: 1200, margin: "0 auto" }}>
            <SectionLabel text="Slide 08" />
            <div style={{ textAlign: "center", marginBottom: 80 }}>
              <h2 style={{ fontSize: "clamp(28px, 3.5vw, 48px)", fontWeight: 900, marginBottom: 16 }}>
                Temas <span style={{ color: "#00C853" }}>Técnicos</span>
              </h2>
              <div style={{ width: 48, height: 4, background: "#00C853", borderRadius: 2, margin: "0 auto 24px" }} />
              <p style={{ fontSize: 15, color: "rgba(255,255,255,0.5)", maxWidth: 560, margin: "0 auto" }}>
                Conteúdo de alto nível técnico para engenheiros, projetistas e gestores de energia
              </p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 16 }}>
              {[
                { icon: "📉", topic: "Peak Shaving", sub: "Gestão de demanda e redução de tarifas" },
                { icon: "🌐", topic: "Grid Forming", sub: "Formação de rede com inversores BESS" },
                { icon: "🧠", topic: "EMS Avançado", sub: "Sistemas de gerenciamento de energia" },
                { icon: "🔗", topic: "Microgrids", sub: "Ilhamento inteligente e resiliência" },
                { icon: "☀️", topic: "BESS + Solar", sub: "Hibridização fotovoltaica" },
                { icon: "📊", topic: "Mercado Livre", sub: "Estratégias de trading energético" },
                { icon: "🎯", topic: "Power Quality", sub: "Qualidade e estabilidade da energia" },
                { icon: "🤖", topic: "IA & BESS", sub: "Otimização por inteligência artificial" },
                { icon: "📋", topic: "Normas ABNT", sub: "Regulação e compliance nacional" },
                { icon: "🏆", topic: "Cases Reais", sub: "Projetos instalados no Brasil" },
              ].map((t, i) => (
                <div
                  key={i}
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.07)",
                    borderRadius: 10,
                    padding: "28px 20px",
                    textAlign: "center",
                    transition: "all 0.2s",
                    cursor: "default",
                  }}
                >
                  <div style={{ fontSize: 28, marginBottom: 12 }}>{t.icon}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 8 }}>{t.topic}</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", lineHeight: 1.5 }}>{t.sub}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════
            SLIDE 9 — PERFIL DO PÚBLICO
        ═══════════════════════════════════════════════════════════ */}
        <section style={{ background: "#082A43", padding: "120px 80px" }}>
          <div style={{ maxWidth: 1200, margin: "0 auto" }}>
            <SectionLabel text="Slide 09" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 80, alignItems: "center" }}>
              <div>
                <h2 style={{ fontSize: "clamp(28px, 3.5vw, 48px)", fontWeight: 900, lineHeight: 1.1, marginBottom: 16 }}>
                  Quem vai<br /><span style={{ color: "#00C853" }}>estar lá?</span>
                </h2>
                <div style={{ width: 48, height: 4, background: "#00C853", borderRadius: 2, marginBottom: 32 }} />
                <p style={{ fontSize: 15, color: "rgba(255,255,255,0.65)", lineHeight: 1.9 }}>
                  O patrocinador fala diretamente com os profissionais que especificam, compram, instalam e operam sistemas BESS no estado.
                </p>
                <div
                  style={{
                    marginTop: 40,
                    background: "rgba(0,200,83,0.08)",
                    border: "1px solid rgba(0,200,83,0.25)",
                    borderRadius: 10,
                    padding: "24px 28px",
                  }}
                >
                  <div style={{ fontSize: 12, letterSpacing: 2, textTransform: "uppercase", color: "#00C853", marginBottom: 8 }}>Insight Estratégico</div>
                  <div style={{ fontSize: 15, color: "rgba(255,255,255,0.8)", lineHeight: 1.7 }}>
                    Seu produto será apresentado a quem decide a compra — não apenas a quem acompanha a tendência.
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {[
                  { profile: "Engenheiros Eletricistas", pct: 35 },
                  { profile: "Projetistas e Integradores EPC", pct: 20 },
                  { profile: "Concessionárias e Distribuidoras", pct: 12 },
                  { profile: "Fabricantes e Distribuidores", pct: 10 },
                  { profile: "Docentes e Pesquisadores", pct: 8 },
                  { profile: "Consultores e Gestores Energéticos", pct: 8 },
                  { profile: "Estudantes de Engenharia", pct: 7 },
                ].map((p, i) => (
                  <div key={i}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontSize: 13, color: "rgba(255,255,255,0.8)", fontWeight: 500 }}>{p.profile}</span>
                      <span style={{ fontSize: 13, color: "#00C853", fontWeight: 700 }}>{p.pct}%</span>
                    </div>
                    <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 4, height: 6 }}>
                      <div style={{ width: `${p.pct}%`, height: "100%", background: "linear-gradient(90deg,#00C853,#00E676)", borderRadius: 4 }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════
            SLIDE 10 — NÚMEROS ESPERADOS
        ═══════════════════════════════════════════════════════════ */}
        <section style={{ position: "relative", overflow: "hidden" }}>
          <img
            src="https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=1600&q=80&fit=crop"
            alt="Engineering conference event"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", filter: "brightness(0.2) saturate(0.5)" }}
          />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(8,42,67,0.6) 0%, rgba(13,27,42,0.95) 100%)" }} />
          <div style={{ position: "relative", zIndex: 10, padding: "120px 80px" }}>
            <div style={{ maxWidth: 1200, margin: "0 auto" }}>
              <SectionLabel text="Slide 10" />
              <div style={{ textAlign: "center", marginBottom: 80 }}>
                <h2 style={{ fontSize: "clamp(28px, 3.5vw, 48px)", fontWeight: 900, marginBottom: 16 }}>
                  Números <span style={{ color: "#00C853" }}>Esperados</span>
                </h2>
                <div style={{ width: 48, height: 4, background: "#00C853", borderRadius: 2, margin: "0 auto" }} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 2 }}>
                {[
                  { num: "300+", label: "Participantes", sub: "Profissionais e estudantes" },
                  { num: "30+", label: "Empresas", sub: "Representadas no evento" },
                  { num: "02", label: "Cidades", sub: "Cuiabá & Rondonópolis" },
                  { num: "100%", label: "Foco Técnico", sub: "Conteúdo aplicado" },
                ].map((n, i) => (
                  <div
                    key={i}
                    style={{
                      padding: "60px 40px",
                      textAlign: "center",
                      borderRight: i < 3 ? "1px solid rgba(255,255,255,0.08)" : "none",
                    }}
                  >
                    <div style={{ fontSize: "clamp(48px, 5vw, 72px)", fontWeight: 900, color: "#00C853", lineHeight: 1 }}>{n.num}</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginTop: 16, marginBottom: 8 }}>{n.label}</div>
                    <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)" }}>{n.sub}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════
            SLIDE 11 — PLANO DE DIVULGAÇÃO
        ═══════════════════════════════════════════════════════════ */}
        <section style={{ background: "#F4F6F8", color: "#0D1B2A", padding: "120px 80px" }}>
          <div style={{ maxWidth: 1200, margin: "0 auto" }}>
            <SectionLabel text="Slide 11" dark />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 80, alignItems: "center" }}>
              <div>
                <h2 style={{ fontSize: "clamp(28px, 3.5vw, 48px)", fontWeight: 900, color: "#082A43", lineHeight: 1.1, marginBottom: 16 }}>
                  Plano de<br /><span style={{ color: "#00C853" }}>Divulgação</span>
                </h2>
                <div style={{ width: 48, height: 4, background: "#00C853", borderRadius: 2, marginBottom: 32 }} />
                <p style={{ fontSize: 15, color: "#718096", lineHeight: 1.9 }}>
                  Estratégia de comunicação integrada para alcançar os profissionais certos em todos os canais relevantes ao setor de energia elétrica em Mato Grosso.
                </p>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                {[
                  { icon: "📱", ch: "Instagram & Reels", reach: "15.000+ seguidores AMEE" },
                  { icon: "💼", ch: "LinkedIn Corporativo", reach: "Engenheiros e gestores" },
                  { icon: "🏛️", ch: "CREA-MT Oficial", reach: "12.000 profissionais" },
                  { icon: "🎓", ch: "Universidades", reach: "UFMT, UNEMAT, UniCuiabá" },
                  { icon: "🌐", ch: "Portais Técnicos", reach: "Canal Solar, Greener" },
                  { icon: "🔍", ch: "Google Ads", reach: "Remarketing segmentado" },
                  { icon: "💬", ch: "WhatsApp", reach: "Grupos de engenharia MT" },
                  { icon: "📧", ch: "Email Marketing", reach: "Base AMEE + CREA" },
                ].map((c, i) => (
                  <div key={i} style={{ background: "#fff", borderRadius: 10, padding: "20px 24px", boxShadow: "0 2px 16px rgba(8,42,67,0.06)" }}>
                    <div style={{ fontSize: 24, marginBottom: 10 }}>{c.icon}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#082A43", marginBottom: 6 }}>{c.ch}</div>
                    <div style={{ fontSize: 11, color: "#A0AEC0" }}>{c.reach}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════
            SLIDE 12 — NETWORKING
        ═══════════════════════════════════════════════════════════ */}
        <section style={{ background: "#0D1B2A", padding: "120px 80px" }}>
          <div style={{ maxWidth: 1200, margin: "0 auto" }}>
            <SectionLabel text="Slide 12" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 80, alignItems: "center" }}>
              <div>
                <h2 style={{ fontSize: "clamp(28px, 3.5vw, 48px)", fontWeight: 900, lineHeight: 1.1, marginBottom: 16 }}>
                  Networking &<br /><span style={{ color: "#00C853" }}>Negócios</span>
                </h2>
                <div style={{ width: 48, height: 4, background: "#00C853", borderRadius: 2, marginBottom: 32 }} />
                <p style={{ fontSize: 15, color: "rgba(255,255,255,0.65)", lineHeight: 1.9, marginBottom: 48 }}>
                  Além das palestras técnicas, o Fórum oferece momentos estratégicos de conexão entre compradores, especificadores e fornecedores de tecnologia.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                  {[
                    { icon: "🏪", title: "Área de Exposição", desc: "Stands físicos para demonstração de produtos e tecnologias" },
                    { icon: "☕", title: "Coffee Networking", desc: "Momentos formais de interação entre palestras" },
                    { icon: "🥂", title: "Happy Hour Exclusivo", desc: "Coquetel de encerramento para patrocinadores e convidados" },
                    { icon: "🤝", title: "Rodadas de Negócios", desc: "Reuniões B2B pré-agendadas de 15 minutos" },
                  ].map((n, i) => (
                    <div key={i} style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
                      <div style={{ fontSize: 24, minWidth: 40, textAlign: "center", marginTop: 2 }}>{n.icon}</div>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", marginBottom: 4 }}>{n.title}</div>
                        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>{n.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ position: "relative" }}>
                <img
                  src="https://images.unsplash.com/photo-1515187029135-18ee286d815b?w=800&q=85&fit=crop"
                  alt="Professional networking event"
                  style={{ width: "100%", borderRadius: 12, filter: "brightness(0.8)" }}
                />
              </div>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════
            SLIDE 13 — POR QUE PATROCINAR
        ═══════════════════════════════════════════════════════════ */}
        <section style={{ background: "#082A43", padding: "120px 80px", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", right: -200, top: "50%", transform: "translateY(-50%)", width: 600, height: 600, borderRadius: "50%", border: "1px solid rgba(0,200,83,0.08)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", right: -140, top: "50%", transform: "translateY(-50%)", width: 400, height: 400, borderRadius: "50%", border: "1px solid rgba(0,200,83,0.12)", pointerEvents: "none" }} />
          <div style={{ maxWidth: 1200, margin: "0 auto" }}>
            <SectionLabel text="Slide 13" />
            <div style={{ textAlign: "center", marginBottom: 80 }}>
              <h2 style={{ fontSize: "clamp(28px, 3.5vw, 48px)", fontWeight: 900, marginBottom: 16 }}>
                Por que <span style={{ color: "#00C853" }}>Patrocinar?</span>
              </h2>
              <div style={{ width: 48, height: 4, background: "#00C853", borderRadius: 2, margin: "0 auto 24px" }} />
              <p style={{ fontSize: 17, color: "rgba(255,255,255,0.65)", maxWidth: 640, margin: "0 auto", lineHeight: 1.8, fontWeight: 300 }}>
                Seu produto estará na frente de quem especifica equipamentos, define projetos e autoriza compras. Não é anúncio — é posicionamento técnico.
              </p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 32 }}>
              {[
                {
                  num: "01",
                  title: "Acesso Direto ao Especificador",
                  desc: "Engenheiros e projetistas que decidem qual tecnologia entra no projeto. Você fala com quem importa.",
                },
                {
                  num: "02",
                  title: "Posicionamento Técnico Premium",
                  desc: "Sua marca associada ao maior evento técnico de BESS do Centro-Oeste, com credibilidade do CREA-MT.",
                },
                {
                  num: "03",
                  title: "Geração de Leads Qualificados",
                  desc: "Listas de presença, scanners de crachá, rodadas de negócio — leads quentes com intenção real de compra.",
                },
                {
                  num: "04",
                  title: "Lançamento de Produtos",
                  desc: "O fórum é o ambiente ideal para lançar novos sistemas BESS, inversores e tecnologias para o mercado brasileiro.",
                },
                {
                  num: "05",
                  title: "Visibilidade Regional Estratégica",
                  desc: "Mato Grosso é o maior estado produtor de energia solar per capita do Brasil. Chegar primeiro importa.",
                },
                {
                  num: "06",
                  title: "Relações Institucionais",
                  desc: "Conexão direta com AMEE, CREA-MT, universidades e órgãos reguladores do setor elétrico estadual.",
                },
              ].map((r, i) => (
                <div key={i} style={{ padding: "40px 32px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#00C853", letterSpacing: 4, marginBottom: 16 }}>{r.num}</div>
                  <div style={{ width: 32, height: 2, background: "#00C853", borderRadius: 1, marginBottom: 20 }} />
                  <div style={{ fontSize: 17, fontWeight: 700, color: "#fff", marginBottom: 12, lineHeight: 1.3 }}>{r.title}</div>
                  <div style={{ fontSize: 14, color: "rgba(255,255,255,0.55)", lineHeight: 1.8 }}>{r.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════
            COTAS DE PATROCÍNIO — HEADER
        ═══════════════════════════════════════════════════════════ */}
        <section style={{ background: "#0D1B2A", padding: "80px 80px 40px", textAlign: "center" }}>
          <div style={{ maxWidth: 1200, margin: "0 auto" }}>
            <div style={{ display: "inline-block", background: "rgba(0,200,83,0.1)", border: "1px solid rgba(0,200,83,0.3)", borderRadius: 2, padding: "6px 20px", fontSize: 11, fontWeight: 700, letterSpacing: 4, color: "#00C853", marginBottom: 24, textTransform: "uppercase" }}>
              Slides 14–18 · Cotas de Patrocínio
            </div>
            <h2 style={{ fontSize: "clamp(28px, 4vw, 56px)", fontWeight: 900, marginBottom: 16 }}>
              Invista no <span style={{ color: "#00C853" }}>Futuro da Energia</span>
            </h2>
            <div style={{ width: 48, height: 4, background: "#00C853", borderRadius: 2, margin: "0 auto 24px" }} />
            <p style={{ fontSize: 16, color: "rgba(255,255,255,0.55)", maxWidth: 560, margin: "0 auto" }}>
              Cinco níveis de parceria, cada um com benefícios exclusivos e visibilidade diferenciada
            </p>
          </div>
        </section>

        {/* ─── COTA MASTER ─── */}
        <QuotaSlide
          slide="14"
          level="MASTER"
          color="#FFD700"
          bg="linear-gradient(135deg,#1a1200 0%,#0D1B2A 100%)"
          borderColor="#FFD700"
          glowColor="rgba(255,215,0,0.15)"
          price="R$ 25.000"
          qty={1}
          benefits={[
            "Naming rights do evento (co-branding no título)",
            "Stand exclusivo 12m² com energia e mobiliário premium",
            "Keynote de 20 min no palco principal (2 cidades)",
            "Logo gigante em todos os materiais (tela, banner, site, crachá)",
            "05 inscrições gratuitas VIP com acesso total",
            "Apresentação completa do catálogo na abertura",
            "Entrevista exclusiva para redes sociais AMEE",
            "Mailing completo dos participantes pós-evento",
            "Espaço para banner 3×2m no foyer",
            "Inclusão em press release e nota para imprensa",
            "Logo em todas as artes digitais e impressas",
            "Menção em todos os posts e stories",
          ]}
        />

        {/* ─── COTA DIAMANTE ─── */}
        <QuotaSlide
          slide="15"
          level="DIAMANTE"
          color="#B9F2FF"
          bg="linear-gradient(135deg,#001020 0%,#082A43 100%)"
          borderColor="#B9F2FF"
          glowColor="rgba(185,242,255,0.1)"
          price="R$ 18.000"
          qty={2}
          benefits={[
            "Stand 9m² com identificação visual exclusiva",
            "Palestra técnica de 15 min (1 cidade à escolha)",
            "Logo destaque em materiais (banner, site, crachá)",
            "03 inscrições gratuitas incluídas",
            "Espaço para banner 2×1m no evento",
            "Mailing dos participantes pós-evento",
            "Logo em todas as artes digitais",
            "Menção nos posts de divulgação",
            "Acesso à área VIP e happy hour exclusivo",
          ]}
        />

        {/* ─── COTA OURO ─── */}
        <QuotaSlide
          slide="16"
          level="OURO"
          color="#FFA726"
          bg="linear-gradient(135deg,#120a00 0%,#0D1B2A 100%)"
          borderColor="#FFA726"
          glowColor="rgba(255,167,38,0.1)"
          price="R$ 12.000"
          qty={3}
          benefits={[
            "Stand 6m² com identificação visual",
            "Apresentação de 10 min em painel técnico",
            "02 inscrições gratuitas incluídas",
            "Logo em materiais do evento (banner, site)",
            "Espaço para roll-up no evento",
            "Menção nas redes sociais",
            "Logo no crachá dos participantes",
          ]}
        />

        {/* ─── COTA PRATA ─── */}
        <QuotaSlide
          slide="17"
          level="PRATA"
          color="#CFD8DC"
          bg="linear-gradient(135deg,#0a0a12 0%,#0D1B2A 100%)"
          borderColor="#CFD8DC"
          glowColor="rgba(207,216,220,0.08)"
          price="R$ 7.000"
          qty={5}
          benefits={[
            "Mesa de exposição 2m com identificação",
            "01 inscrição gratuita incluída",
            "Logo no site do evento e banner principal",
            "Menção nas redes sociais AMEE",
            "Distribuição de material no kit do participante",
            "Logo no painel de patrocinadores",
          ]}
        />

        {/* ─── COTA BRONZE ─── */}
        <QuotaSlide
          slide="18"
          level="BRONZE"
          color="#FF8A65"
          bg="linear-gradient(135deg,#120800 0%,#0D1B2A 100%)"
          borderColor="#FF8A65"
          glowColor="rgba(255,138,101,0.08)"
          price="R$ 3.500"
          qty={8}
          benefits={[
            "Logo no site do evento",
            "Logo no painel de patrocinadores",
            "01 inscrição com desconto de 100%",
            "Distribuição de material no kit do participante",
            "Menção nas redes sociais",
          ]}
        />

        {/* ═══════════════════════════════════════════════════════════
            SLIDE 19 — EMPRESAS DESEJADAS
        ═══════════════════════════════════════════════════════════ */}
        <section style={{ background: "#082A43", padding: "120px 80px" }}>
          <div style={{ maxWidth: 1200, margin: "0 auto" }}>
            <SectionLabel text="Slide 19" />
            <div style={{ textAlign: "center", marginBottom: 80 }}>
              <h2 style={{ fontSize: "clamp(28px, 3.5vw, 48px)", fontWeight: 900, marginBottom: 16 }}>
                Parceiros <span style={{ color: "#00C853" }}>Estratégicos</span>
              </h2>
              <div style={{ width: 48, height: 4, background: "#00C853", borderRadius: 2, margin: "0 auto 24px" }} />
              <p style={{ fontSize: 15, color: "rgba(255,255,255,0.5)", maxWidth: 560, margin: "0 auto" }}>
                Empresas que moldaram o setor global de armazenamento de energia — parceiros ideais deste fórum
              </p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 2 }}>
              {[
                { name: "Huawei Digital Power", cat: "Inversores & BESS" },
                { name: "Sungrow", cat: "Storage & Solar" },
                { name: "WEG", cat: "Equipamentos Elétricos" },
                { name: "ABB", cat: "Grid & Automation" },
                { name: "Schneider Electric", cat: "EMS & Microgrids" },
                { name: "Siemens Energy", cat: "Grid Solutions" },
                { name: "BYD Energy", cat: "Battery Storage" },
                { name: "CATL", cat: "Células & Sistemas" },
                { name: "Dyness", cat: "BESS Residencial" },
                { name: "GoodWe", cat: "Inversores Híbridos" },
                { name: "Moura", cat: "Baterias Nacionais" },
                { name: "Canadian Solar", cat: "Módulos & BESS" },
                { name: "Tesla Energy", cat: "Powerwall / Megapack" },
              ].map((c, i) => (
                <div
                  key={i}
                  style={{
                    padding: "32px 24px",
                    borderRight: (i + 1) % 4 !== 0 ? "1px solid rgba(255,255,255,0.06)" : "none",
                    borderBottom: i < 9 ? "1px solid rgba(255,255,255,0.06)" : "none",
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      background: "rgba(0,200,83,0.08)",
                      border: "1px solid rgba(0,200,83,0.2)",
                      borderRadius: 10,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 10,
                      fontWeight: 900,
                      color: "#00C853",
                      letterSpacing: 0.5,
                      margin: "0 auto 16px",
                    }}
                  >
                    {c.name.substring(0, 2).toUpperCase()}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 4 }}>{c.name}</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", letterSpacing: 1 }}>{c.cat}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════
            SLIDE 20 — CONTATO
        ═══════════════════════════════════════════════════════════ */}
        <section style={{ position: "relative", minHeight: "80vh", display: "flex", alignItems: "center", overflow: "hidden" }}>
          <img
            src="https://images.unsplash.com/photo-1508514177221-188b1cf16e9d?w=1600&q=80&fit=crop"
            alt="Solar energy at sunset"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", filter: "brightness(0.25) saturate(0.6)" }}
          />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, rgba(8,42,67,0.95) 0%, rgba(13,27,42,0.8) 100%)" }} />
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, background: "linear-gradient(90deg,#00C853,#00E676,#00C853)" }} />
          <div style={{ position: "relative", zIndex: 10, padding: "100px 80px", width: "100%", maxWidth: 1200, margin: "0 auto" }}>
            <SectionLabel text="Slide 20" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 80, alignItems: "center" }}>
              <div>
                <h2 style={{ fontSize: "clamp(28px, 3.5vw, 52px)", fontWeight: 900, lineHeight: 1.1, marginBottom: 16 }}>
                  Vamos <span style={{ color: "#00C853" }}>conversar?</span>
                </h2>
                <div style={{ width: 48, height: 4, background: "#00C853", borderRadius: 2, marginBottom: 32 }} />
                <p style={{ fontSize: 16, color: "rgba(255,255,255,0.65)", lineHeight: 1.9, marginBottom: 48, fontWeight: 300 }}>
                  Entre em contato com nossa equipe comercial para reservar sua cota de patrocínio e garantir o posicionamento da sua marca no Fórum BESS 2026.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                  {[
                    { icon: "🌐", label: "Site", val: "www.abeemt.org.br" },
                    { icon: "📧", label: "Email", val: "contato@amee-mt.org.br" },
                    { icon: "📱", label: "Instagram", val: "@amee.mt" },
                    { icon: "📞", label: "Telefone", val: "(65) 3xxx-xxxx" },
                  ].map((c, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 20 }}>
                      <div style={{ width: 44, height: 44, background: "rgba(0,200,83,0.1)", border: "1px solid rgba(0,200,83,0.3)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
                        {c.icon}
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", letterSpacing: 2, textTransform: "uppercase", marginBottom: 2 }}>{c.label}</div>
                        <div style={{ fontSize: 15, fontWeight: 600, color: "#fff" }}>{c.val}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 32 }}>
                {/* QR Code placeholder */}
                <div
                  style={{
                    width: 200,
                    height: 200,
                    background: "#fff",
                    borderRadius: 16,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    padding: 20,
                    boxShadow: "0 0 60px rgba(0,200,83,0.2)",
                  }}
                >
                  {/* Simplified QR code visual */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3, width: 140, height: 140 }}>
                    {Array.from({ length: 49 }, (_, i) => {
                      const qrPattern = [
                        1,1,1,1,1,1,1,
                        1,0,0,0,0,0,1,
                        1,0,1,0,1,0,1,
                        1,0,0,0,0,0,1,
                        1,1,1,1,1,1,1,
                        0,1,0,0,1,0,0,
                        1,1,1,0,1,1,1,
                      ];
                      return (
                        <div
                          key={i}
                          style={{
                            background: qrPattern[i] ? "#082A43" : "transparent",
                            borderRadius: 2,
                          }}
                        />
                      );
                    })}
                  </div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>Acesse o site</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#00C853" }}>www.abeemt.org.br</div>
                </div>
                <div
                  style={{
                    background: "linear-gradient(135deg,#00C853,#00E676)",
                    color: "#0D1B2A",
                    fontWeight: 800,
                    fontSize: 15,
                    letterSpacing: 2,
                    textTransform: "uppercase",
                    padding: "18px 48px",
                    borderRadius: 4,
                    cursor: "pointer",
                    boxShadow: "0 8px 32px rgba(0,200,83,0.3)",
                  }}
                >
                  Quero ser Patrocinador
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer
          style={{
            background: "#070F1A",
            padding: "48px 80px",
            borderTop: "1px solid rgba(255,255,255,0.06)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 24,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <div style={{ width: 40, height: 40, borderRadius: "50%", border: "1.5px solid #00C853", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: "#00C853" }}>AMEE</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.8)" }}>Associação Mato-grossense dos Engenheiros Eletricistas</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>Apoio: CREA-MT</div>
            </div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.25)", letterSpacing: 1 }}>
              Fórum BESS 2026 · 28 Set Cuiabá · 30 Set Rondonópolis
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: "#00C853", letterSpacing: 2, textTransform: "uppercase", fontWeight: 700 }}>Media Kit 2026</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 4 }}>Material confidencial para patrocinadores</div>
          </div>
        </footer>
      </main>
    </>
  );
}

/* ─────────────────── Helper Components ─────────────────── */

function DateChip({ day, month, year, city }: { day: string; month: string; year: string; city: string }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.06)",
        backdropFilter: "blur(8px)",
        border: "1px solid rgba(255,255,255,0.15)",
        borderRadius: 8,
        padding: "20px 28px",
        minWidth: 160,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 8 }}>
        <span style={{ fontSize: 36, fontWeight: 900, color: "#fff", lineHeight: 1 }}>{day}</span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#00C853", letterSpacing: 2 }}>{month}</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", letterSpacing: 1 }}>{year}</div>
        </div>
      </div>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", fontWeight: 500 }}>{city}</div>
    </div>
  );
}

function SectionLabel({ text, dark }: { text: string; dark?: boolean }) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 4,
        color: dark ? "rgba(8,42,67,0.3)" : "rgba(255,255,255,0.2)",
        textTransform: "uppercase",
        marginBottom: 48,
      }}
    >
      {text}
    </div>
  );
}

function QuotaSlide({
  slide,
  level,
  color,
  bg,
  borderColor,
  glowColor,
  price,
  qty,
  benefits,
}: {
  slide: string;
  level: string;
  color: string;
  bg: string;
  borderColor: string;
  glowColor: string;
  price: string;
  qty: number;
  benefits: string[];
}) {
  return (
    <section
      style={{
        background: bg,
        padding: "100px 80px",
        borderTop: `1px solid rgba(255,255,255,0.04)`,
      }}
    >
      <div style={{ maxWidth: 1000, margin: "0 auto" }}>
        <SectionLabel text={`Slide ${slide}`} />
        <div
          style={{
            border: `1px solid ${borderColor}30`,
            borderRadius: 16,
            padding: "60px 64px",
            background: glowColor,
            boxShadow: `0 0 80px ${glowColor}`,
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${borderColor}, ${color}aa, transparent)` }} />

          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 48, alignItems: "start", marginBottom: 48 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 6, color, textTransform: "uppercase", marginBottom: 12 }}>
                Cota de Patrocínio
              </div>
              <div
                style={{
                  fontSize: "clamp(40px, 6vw, 72px)",
                  fontWeight: 900,
                  color,
                  lineHeight: 0.9,
                  letterSpacing: -2,
                }}
              >
                {level}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", letterSpacing: 3, textTransform: "uppercase", marginBottom: 8 }}>Investimento</div>
              <div style={{ fontSize: "clamp(28px, 4vw, 48px)", fontWeight: 900, color: "#fff" }}>{price}</div>
              <div
                style={{
                  display: "inline-block",
                  background: `${color}20`,
                  border: `1px solid ${color}50`,
                  borderRadius: 4,
                  padding: "4px 12px",
                  fontSize: 12,
                  color,
                  fontWeight: 700,
                  marginTop: 8,
                }}
              >
                {qty === 1 ? "Cota exclusiva — 1 vaga" : `Apenas ${qty} vagas disponíveis`}
              </div>
            </div>
          </div>

          <div style={{ width: "100%", height: 1, background: `linear-gradient(90deg, ${borderColor}40, transparent)`, marginBottom: 40 }} />

          <div style={{ display: "grid", gridTemplateColumns: benefits.length > 6 ? "1fr 1fr" : "1fr", gap: "12px 40px" }}>
            {benefits.map((b, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                <div
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: color,
                    flexShrink: 0,
                    marginTop: 7,
                  }}
                />
                <span style={{ fontSize: 14, color: "rgba(255,255,255,0.75)", lineHeight: 1.6 }}>{b}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
