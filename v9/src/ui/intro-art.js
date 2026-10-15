// Presentation artwork adapted from the original office and magazine.
const SKYLINE = `
<svg class="skyline" viewBox="0 0 800 220" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
  <g fill="#2A1E26">
    <rect x="0" y="140" width="60" height="80"/><rect x="55" y="110" width="44" height="110"/>
    <rect x="100" y="150" width="70" height="70"/><rect x="165" y="95" width="38" height="125"/>
    <rect x="200" y="128" width="60" height="92"/>
    <path d="M300 220 L322 40 L326 8 L330 40 L352 220 Z"/>
    <rect x="360" y="120" width="54" height="100"/><rect x="410" y="80" width="46" height="140"/>
    <rect x="452" y="135" width="66" height="85"/><rect x="515" y="100" width="40" height="120"/>
    <rect x="552" y="60" width="52" height="160"/><rect x="600" y="140" width="70" height="80"/>
    <rect x="668" y="112" width="48" height="108"/><rect x="712" y="150" width="88" height="70"/>
  </g>
  <g fill="#FFC979" opacity=".75">
    <rect x="62" y="122" width="4" height="5"/><rect x="74" y="140" width="4" height="5"/><rect x="172" y="110" width="4" height="5"/>
    <rect x="186" y="150" width="4" height="5"/><rect x="420" y="96" width="4" height="5"/><rect x="436" y="128" width="4" height="5"/>
    <rect x="562" y="80" width="4" height="5"/><rect x="580" y="118" width="4" height="5"/><rect x="590" y="96" width="4" height="5"/>
    <rect x="676" y="130" width="4" height="5"/><rect x="522" y="120" width="4" height="5"/><rect x="372" y="140" width="4" height="5"/>
  </g>
</svg>`;
const PHONE = `
<svg class="desk-phone" viewBox="0 0 120 80" aria-hidden="true">
  <path d="M10 70 L22 34 L98 34 L110 70 Z" fill="#D8CCB2" stroke="#1B1814" stroke-width="2"/>
  <rect x="38" y="42" width="44" height="22" rx="3" fill="#C2B594" stroke="#1B1814" stroke-width="1.5"/>
  <g fill="#1B1814">${Array.from({ length: 12 }, (_, i) => `<rect x="${42 + (i % 4) * 10}" y="${45 + Math.floor(i / 4) * 6}" width="6" height="3.5" rx="1"/>`).join('')}</g>
  <path class="handset" d="M14 30 C14 18 22 14 30 14 L90 14 C98 14 106 18 106 30 L94 30 C94 24 90 22 86 22 L34 22 C30 22 26 24 26 30 Z" fill="#E3D8C0" stroke="#1B1814" stroke-width="2"/>
  <path d="M10 64 q-6 4 0 8 q6 4 0 8" fill="none" stroke="#BFB194" stroke-width="2"/>
</svg>`;
const FACADE = `
<svg class="facade" viewBox="0 0 400 230" aria-hidden="true">
  <rect x="0" y="0" width="400" height="230" fill="none"/>
  <path d="M20 66 L380 66 L380 54 L200 20 L20 54 Z" fill="none" stroke="#1B1814" stroke-width="2.5"/>
  <rect x="30" y="66" width="340" height="22" fill="none" stroke="#1B1814" stroke-width="2"/>
  <text x="200" y="82" text-anchor="middle" class="facade-text">HAIGHT STREET COMPUTE</text>
  ${[0, 1, 2, 3, 4, 5].map((i) => {
    const x = 52 + i * 59;
    return `<g stroke="#1B1814" stroke-width="2" fill="none">
      <path d="M${x - 11} 96 q-5 -6 3 -8 h16 q8 2 3 8"/>
      <rect x="${x - 9}" y="96" width="18" height="96"/>
      <path d="M${x - 4} 100 V188 M${x + 1} 100 V188 M${x + 6} 100 V188" stroke-width=".8"/>
      <rect x="${x - 12}" y="192" width="24" height="7"/>
    </g>`;
  }).join('')}
  <rect x="18" y="199" width="364" height="10" fill="none" stroke="#1B1814" stroke-width="2"/>
  <rect x="8" y="209" width="384" height="12" fill="none" stroke="#1B1814" stroke-width="2"/>
  <path d="M184 192 V150 Q200 132 216 150 V192" fill="none" stroke="#1B1814" stroke-width="2"/><path d="M200 140 V192" stroke="#1B1814" stroke-width="1.2"/>
  <circle cx="200" cy="44" r="9" fill="none" stroke="#1B1814" stroke-width="2"/>
  <path d="M200 38 v6 l4 3" stroke="#1B1814" stroke-width="1.6" fill="none"/>
</svg>`;

export { SKYLINE, PHONE, FACADE };
