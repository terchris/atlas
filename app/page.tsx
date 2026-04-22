export default function HomePage() {
  return (
    <main
      style={{
        maxWidth: "48rem",
        margin: "4rem auto",
        padding: "0 1rem",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <h1>Atlas</h1>
      <p>
        Et norsk portal til den frivillige sektoren. Under oppbygging — her
        vil du finne oversikt over humanitære behov per kommune og
        organisasjonene som jobber der.
      </p>

      <section style={{ margin: "2rem 0" }}>
        <h2 style={{ fontSize: "1.15rem" }}>Tilgjengelig nå</h2>
        <ul>
          <li>
            <a href="/coverage-gap/barnefattigdom">
              <strong>Barnefattigdom i Norge</strong>
            </a>{" "}
            — interaktivt kart over andel barn under 18 år i lavinntekts­husholdninger, per kommune
          </li>
          <li>
            <a href="/kommuner/0301">Kommune-detaljvisning</a>{" "}
            — alle tilgjengelige indikatorer per kommune (eksempel: Oslo)
          </li>
          <li>
            <a href="/data">Data-utforsker</a>{" "}
            — alle indikatorer på kartet, for datakvalitetskontroll
          </li>
        </ul>
      </section>

      <p style={{ marginTop: "2rem", color: "#666", fontSize: "0.9rem" }}>
        Atlas v0 · Data fra{" "}
        <a href="https://www.ssb.no/" target="_blank" rel="noopener noreferrer">
          Statistisk sentralbyrå
        </a>
      </p>
    </main>
  );
}
