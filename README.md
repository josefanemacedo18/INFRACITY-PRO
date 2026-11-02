# URBIS

Software de projeto urbano e viário para uso interno do escritório. Ele une num único ambiente:

- o **rigor técnico** de um software de engenharia de infraestrutura (eixo, greide, seções, corredor, volumes, quantitativos);
- o **contexto territorial** (terreno georreferenciado em SIRGAS 2000 / UTM, loteamento, quadro de áreas);
- a **facilidade de uso** de um jogo de construção de cidades (desenhar a via com cliques e ver a avenida, os taludes e os volumes atualizarem na hora).

Tudo funciona **offline**, no Windows, e gera **PDF** e **Excel**.

## Como instalar

1. Abra a página **Releases** deste repositório no GitHub.
2. Baixe o arquivo mais recente `URBIS-Setup-x.y.z.exe` (instalador) ou `URBIS-Portatil-x.y.z-x64.zip` (versão portátil, sem instalação).
3. Execute o instalador. Não é preciso ser administrador.
4. Se o Windows mostrar **"O Windows protegeu o computador"**, clique em **Mais informações** e em **Executar assim mesmo**. O aviso aparece porque o instalador não tem assinatura digital paga.

O instalador é gerado automaticamente pelo GitHub Actions a cada atualização do código (fluxo `Instalador Windows`).

## O que o URBIS faz

| Módulo | Recursos |
|---|---|
| 01 Terreno e topografia | Importação de pontos CSV/TXT (PNEZD, ENZ etc., vírgula ou ponto decimal), DXF e DWG (R14 a 2018+) com escolha de camadas, blocos com atributo de cota, textos de cota, curvas de nível e 3D polylines como linhas de quebra. Superfície TIN, curvas de nível, remoção de triângulos longos de borda. |
| 02 Sistema viário | Desenho do eixo por cliques com raios automáticos, curvas circulares e espirais de transição, estaqueamento, greide automático ou editável (PIVs arrastáveis), curvas verticais parabólicas, seção tipo com faixas, acostamento, sarjeta, meio-fio, passeio, canteiro e ciclovia, superelevação pelo critério do DNER. |
| 03 Infraestrutura hidráulica | Método racional com equação IDF, verificação de sarjetas (Izzard) e espaçamento de captações, rede de galerias ao longo da via (Manning, diâmetros comerciais, recobrimento e velocidades). |
| 04 Urbanismo | Gleba, quadras geradas automaticamente pelas vias, divisão em lotes com frente para a rua, verificação da Lei 6.766/1979, quadro de áreas e descrição perimétrica dos lotes. |
| 05 Terraplenagem | Seções transversais exatas sobre o TIN, taludes de corte e aterro, áreas, volumes por média das áreas, fator de homogeneização, diagrama de Brückner, limpeza e camada vegetal. |
| 06 Documentação | Pranchas A0 a A3 (planta e perfil, seções, loteamento) com carimbo, quadros técnicos, nota de serviço, memorial descritivo, orçamento e planilha Excel completa com fórmulas. |
| Sinalização | Linhas longitudinais automáticas (MBST Vol. IV), faixas de pedestres, placas sugeridas (velocidade e curvas) e inseridas pelo usuário, com quantitativos. |

Além disso:

- **Três modos**: conceitual (experimentar), técnico (cotas, estacas, verificações) e apresentação (3D com iluminação, sombras e vegetação).
- **Linha do tempo**: cada alteração fica registrada. Clique num ponto para voltar, use Ctrl+Z / Ctrl+Y, salve versões e compare alternativas (volumes, custo, lotes).
- **Verificações normativas** em tempo real, com a fonte de cada parâmetro.

## Normas

O perfil normativo está em `app/core/norms/brasil.js` e pode ser consultado no programa em **Normas aplicadas**. Cada valor tem a fonte (DNIT, CONTRAN, ABNT, leis federais) e um status:

- **confirmado**: conferido em pesquisa durante o desenvolvimento;
- **referência**: valor da norma a conferir no documento oficial;
- **prática**: prática corrente de projeto, ajustável.

Veja [docs/NORMAS.md](docs/NORMAS.md).

## Documentação

- [Manual do usuário](docs/MANUAL.md)
- [Normas e parâmetros](docs/NORMAS.md)
- [Próximas etapas](docs/ROADMAP.md)

## Desenvolvimento

Requisitos: Node.js 22.

```bash
npm install
```

```bash
npm test
```

```bash
npm run serve
```

`npm run serve` abre a versão de navegador em `http://localhost:8090`. Para o aplicativo desktop, use `npm start`. Para gerar o instalador no Windows, use `npm run dist`.

Estrutura:

```
app/core/      cálculo (geometria, TIN, corredor, drenagem, pavimento, sinalização, lotes, relatórios)
app/ui/        interface (Preact + canvas 2D + Three.js)
app/vendor/    bibliotecas copiadas de node_modules (geradas por npm run vendor)
electron/      aplicativo desktop (janela, menus, arquivos)
tests/         testes automatizados (node --test)
```

## Licenças de terceiros

A leitura de DWG usa o LibreDWG (GPL-3.0) compilado para WebAssembly. Para uso interno isso não traz obrigações. Se o URBIS for distribuído a terceiros, o código-fonte precisará ser disponibilizado sob a GPL, ou a leitura de DWG precisará ser substituída. As demais bibliotecas (Three.js, jsPDF, ExcelJS, Preact, Delaunator, polygon-clipping) têm licenças permissivas (MIT/ISC).
