# Manual do usuário — URBIS

## 1. A tela

| Área | Função |
|---|---|
| Barra superior | Nome do projeto, modos (Conceitual, Técnico, Apresentação), desfazer/refazer, salvar |
| Painel de ferramentas (esquerda) | Módulos 01 a 06: terreno, sistema viário, drenagem, urbanismo, terraplenagem, documentação |
| Viewport (centro) | Abas Planta, Perfil longitudinal, Seções transversais e Vista 3D |
| Painel de propriedades (direita) | Parâmetros do objeto selecionado; com nada selecionado, mostra os dados do projeto |
| Linha do tempo (rodapé) | Histórico de alterações, versões e alternativas |
| Barra de status | Coordenadas E/N/Z do cursor, latitude/longitude e estaca/afastamento da via mais próxima |

## 2. Fluxo de trabalho

### 2.1 Começar
- **Novo** cria um projeto vazio. Preencha nome, cliente, responsável técnico, CREA e fuso UTM.
- **Exemplo** abre um projeto completo (avenida, três ruas, drenagem e 86 lotes) para conhecer as ferramentas.

### 2.2 Importar a topografia (módulo 01)
- **Importar pontos (CSV/TXT)**: o URBIS detecta o separador, a vírgula decimal e a ordem das colunas (PNEZD, PENZD, NEZ, ENZ...). Confira na prévia se Este e Norte estão corretos.
- **Importar DWG/DXF**: escolha as camadas do terreno. Camadas com cota já vêm marcadas. Use **Textos = cota** quando o desenho for 2D e as cotas estiverem escritas como texto. Curvas de nível e 3D polylines viram linhas de quebra.
- Também é possível **arrastar o arquivo** para a janela.
- Ajuste **Aresta máxima na borda** para remover triângulos longos em áreas sem levantamento.

### 2.3 Desenhar as vias (módulo 02)
1. Escolha a **classe da nova via** (local, coletora, arterial, trânsito rápido, rodovias I a IV).
2. Clique em **Desenhar via** e clique os pontos do eixo sobre o terreno. A via aparece com as curvas enquanto você desenha.
3. **Duplo clique** ou **Enter** conclui. **Backspace** desfaz o último ponto. **Esc** cancela.

Os raios são escolhidos automaticamente entre Rmin e 2,5·Rmin, cabendo nas tangentes e na transição da superelevação. Para fixar um raio, edite-o na aba **Eixo**: a marca de raio automático é desligada.

### 2.4 Editar
- **Arraste os PIs** na planta (via selecionada). Duplo clique sobre o eixo insere PI; Delete remove.
- **Greide**: na aba Perfil, arraste os PIVs; duplo clique insere; Delete remove. O greide automático segue o terreno respeitando rampa máxima e K. Ao editar, ele passa a ser manual.
- **Seção tipo**: adicione, remova e reordene componentes; ajuste larguras, declividades, taludes, valeta e camadas do pavimento. **Dimensionar (DNER)** calcula as camadas pelo número N e pelo CBR.

### 2.5 Drenagem (módulo 03)
- Informe a **equação IDF** do local nos dados do projeto (clique no fundo da planta). A equação de fábrica é apenas um exemplo.
- Na aba **Drenagem** da via, ative a rede, escolha o lado, o espaçamento dos PVs e o coeficiente C. O URBIS dimensiona as galerias e verifica as sarjetas.

### 2.6 Loteamento (módulo 04)
1. **Desenhar gleba**: clique os vértices; duplo clique fecha.
2. As **quadras** são formadas automaticamente pelas vias que cortam a gleba.
3. Ajuste a frente e a profundidade mínima e clique **Gerar lotes**. Os lotes ficam de frente para a rua. Quadras entre duas ruas paralelas são divididas em duas frentes.
4. Lotes abaixo de 125 m² ou com frente menor que 5 m aparecem em vermelho.
5. Clique num lote para ver área, perímetro e a descrição perimétrica.

### 2.7 Terraplenagem (módulo 05)
- Aba **Seções transversais**: navegue com as setas ← →. Cada seção mostra terreno, projeto, linha de terraplenagem e áreas.
- Aba **Resultados** da via: volumes, saldo e diagrama de Brückner.

### 2.8 Sinalização
- A sinalização horizontal é gerada pela seção tipo. Escolha a linha central e as linhas de bordo na aba **Sinalização**.
- **Inserir placa**: escolha o código (R-19, A-2a...) e clique ao lado da via.
- **Faixa de pedestres**: clique sobre a via.

### 2.9 Documentação (módulo 06)
- **Pranchas, memorial e planilhas**: escolha formato (A0 a A3), escalas e documentos. São gerados PDFs (pranchas, quadros, memorial, orçamento) e uma planilha Excel.
- **Orçamento**: informe os preços unitários (SINAPI, SICRO ou composição própria) e o BDI. A planilha Excel sai com fórmulas.

### 2.10 Versões e alternativas
- **Salvar versão** registra o estado atual (por exemplo, "Alternativa com greide mais alto").
- **Versões** compara extensão, cortes, aterros, saldo, lotes e custo de todas as versões e permite restaurar qualquer uma.

## 3. Modos de visualização

| Modo | Uso |
|---|---|
| Conceitual | Experimentar: faixas coloridas, taludes, sem excesso de rótulos |
| Técnico | Estacas, dados das curvas, coordenadas, cotas, diâmetros e verificações |
| Apresentação | Vista 3D com céu, sombras e árvores nos passeios |

## 4. Atalhos

| Ação | Atalho |
|---|---|
| Salvar / Salvar como | Ctrl+S / Ctrl+Shift+S |
| Abrir / Novo | Ctrl+O / Ctrl+N |
| Desfazer / Refazer | Ctrl+Z / Ctrl+Y |
| Enquadrar | F |
| Navegar | Roda do mouse (zoom), botão direito ou do meio (deslocar) |
| Seções | ← → Home End |
| Exagero vertical do perfil | Shift + roda do mouse |

## 5. Arquivos

- **.urbis**: projeto completo (terreno, vias, loteamento, versões, preços). Use **Salvar** com frequência.
- O URBIS grava uma **cópia de recuperação** automaticamente. Se o programa fechar sem salvar, use **Recuperar o último trabalho não salvo** na tela inicial.

## 6. Limitações desta versão

- Exportação para DWG/DXF ainda não está disponível (planejada).
- Interseções e rotatórias são desenhadas como vias independentes que se cruzam; ainda não há modelagem da área de interseção.
- Bueiros de travessia, bacias hidrográficas a partir do terreno e o método MeDiNa estão no roteiro.
- Os parâmetros com status "referência" devem ser conferidos nos documentos oficiais antes do uso em projeto executivo.
