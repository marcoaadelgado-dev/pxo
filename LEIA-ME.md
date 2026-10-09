# PXO Torneios – app para Android

App instalável (PWA) para gerir concentrações: séries, meias-finais, final,
classificação e tabela geral do circuito. Funciona sem internet depois de instalada.
Os dados ficam guardados no telemóvel.

## Publicar no GitHub Pages (uma vez)

1. Criar conta em https://github.com (gratuito).
2. Botão **New repository** → nome, ex.: `pxo` → **Public** → **Create repository**.
3. Na página do repositório: **uploading an existing file** → arrastar **o conteúdo**
   da pasta `app` (index.html, styles.css, manifest.json, sw.js e as pastas `js` e `icons`)
   → **Commit changes**.
4. **Settings → Pages** → *Source*: **Deploy from a branch** → Branch **main**, pasta **/(root)** → **Save**.
5. Após 1–2 minutos a app fica em `https://<utilizador>.github.io/pxo/`.

Para atualizar a app mais tarde: carregar de novo os ficheiros alterados (passo 3).
Os dados no telemóvel não se perdem.

## Instalar no Android

1. Abrir o endereço acima no **Chrome**.
2. Menu ⋮ → **Instalar app** (ou **Adicionar ao ecrã principal**).
3. A app aparece com o ícone "PXO" e abre em ecrã inteiro, mesmo sem rede.

## Como usar

1. **Nova competição** – escolher *Circuito* (várias concentrações + tabela geral) ou *Concentração única*.
2. **Regras e pontuação** – pontos por jogo (3/1/0), valor dos cartões (amarelo 1, vermelho 3),
   ordem dos critérios de desempate, pontos do circuito (5, 4, 3, 2 e 1 para os restantes).
3. **Nova concentração** – nº de séries, escolher a série de cada clube (a ordem de escolha é a
   numeração na série), hora do 1º jogo e campos (ex.: `1,2`); a app gera os jogos.
   Escolher o formato da fase final e os cruzamentos.
4. Em cada **Série**: introduzir golos e cartões (🟨/🟥 com − / +). A classificação atualiza-se logo.
   - ▲ / ▼ num jogo troca-o com o anterior/seguinte (os dois trocam de hora e campo).
   - *Hora, campo, árbitro* → **⇄ Trocar casa/fora** troca as equipas (com golos e cartões).
   - Se mudar horas à mão, **Ordenar pela hora** volta a pôr a lista por ordem.
5. **Fase final** – as equipas preenchem-se sozinhas quando as séries terminam.
   Empate → aparecem as caixas dos penáltis.
6. **Classificação** – lugares finais e pontos para o circuito.
7. **Tabela geral** – uma coluna por concentração, disciplina acumulada e total.

### Critérios de desempate (por defeito)
Pontos → Disciplina (menos pontos à frente) → Confronto direto → Diferença de golos (GM − GS)
→ Golos marcados → Menos golos sofridos → Sorteio (a app pede para confirmar a ordem).

### Cruzamentos (código do modelo)
- `1A` = 1º da série A · `2B` = 2º da série B
- `M2` = melhor 2º · `M2.2` = segundo melhor 2º · `M1.2` = segundo melhor 1º
- Jogos separados por `|`. Ex.: `1A-M2|1B-1C` (como no +45) ou `1A-1B|1C-1D` (como no +35).
- "Melhor 2º" com séries de tamanhos diferentes: nas séries maiores não contam os jogos contra o último.

### Cópia de segurança
Início → **Cópia de segurança** → *Exportar* gera um ficheiro `.json` (guardar no Google Drive).
*Importar* repõe os dados (ex.: noutro telemóvel).

## Testes
Abrir `tests.html` no browser do PC: verifica as regras de classificação e desempate.
