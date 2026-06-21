# Akaki Odontologia — Site Institucional

Site principal da **Akaki Odontologia** (Jardins · São Paulo) — clínica pioneira em
odontofobia, com sedação consciente e Day Clinic.

Construído em [Astro](https://astro.build) — HTML/CSS/JS, sem framework pesado.
Mesma identidade premium da bio ("O Sopro de Ouro"): ouro como luz, marinho, creme,
tipografia Fraunces + Montserrat + Roboto.

## Páginas

- **Home** (`/`) — jornada cinematográfica: hero "acende as luzes", Day Clinic com
  scroll-scrub, clínica biofílica, filme, depoimentos, localização.
- **Landing pages por serviço** (estrutura de conversão completa):
  - `/implantes`
  - `/sedacao-odontologica`
  - `/ortodontia`
  - `/estetica`
  - `/odontopediatria`

Cada LP: hero + formulário, números, diferenciais, Dr. Luiz Akaki, depoimentos +
nota Google, casos antes/depois, passo a passo, tipos, comparativo, FAQ e CTA.

## Desenvolvimento

```bash
npm install
npm run dev        # http://localhost:4321
npm run build      # gera /dist
npm run preview    # serve o build de produção
```

## Deploy na Vercel

Projeto estático — a Vercel detecta o Astro automaticamente:

- **Framework Preset:** Astro · **Build:** `npm run build` · **Output:** `dist`

## Notas

- Captura de **UTM por botão** (origem → WhatsApp). O formulário do hero abre o
  WhatsApp com nome + telefone + serviço + origem.
- **Placeholders a substituir:** casos antes/depois, depoimentos, e a foto do
  Dr. Akaki (frame do filme institucional).
- Cores da marca: ouro `#d3a46c` · marinho `#18273c` · creme `#f4eee3`.
