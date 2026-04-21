export default function HomePage() {
  return (
    <main style={{ maxWidth: "48rem", margin: "4rem auto", padding: "0 1rem" }}>
      <h1>Atlas</h1>
      <p>
        Et norsk portal til den frivillige sektoren. Under oppbygging — her vil
        du finne oversikt over humanitære behov per kommune og organisasjonene
        som jobber der.
      </p>
      <ul>
        <li>
          <a href="/coverage-gap/barnefattigdom">
            Barnefattigdom i Norge (kart)
          </a>{" "}
          — kommer
        </li>
        <li>
          <a href="/kommuner/0301">Kommune-detaljvisning (eksempel: Oslo)</a>{" "}
          — kommer
        </li>
      </ul>
      <p style={{ marginTop: "2rem", color: "#666", fontSize: "0.9rem" }}>
        Atlas v0 · Data fra Statistisk sentralbyrå (SSB)
      </p>
    </main>
  );
}
