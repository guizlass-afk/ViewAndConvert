# View & Convert

Visualizador e conversor 3D para o toolbox de projetos mecânicos. Todo o arquivo aberto é processado localmente no navegador.

Aplicação publicada: https://guizlass-afk.github.io/ViewAndConvert/

## Recursos da primeira versão

- visualização de STL, OBJ, PLY, 3MF, GLB/GLTF, STEP, IGES e BREP;
- navegação orbital e vistas frontal, superior, lateral e isométrica;
- modos sombreado, arestas, aramado e transparente;
- medição entre vértices da malha ou pontos na superfície, com distância linear e componentes absolutas X, Y e Z;
- corte de seção nos eixos X, Y e Z;
- dimensões gerais, área, volume aproximado, vértices e triângulos;
- árvore de componentes com controle de visibilidade;
- conversão e download em STEP, IGES, BREP, STL binário, OBJ, PLY, 3MF, GLB e glTF;
- importação e exportação CAD em Web Workers, com cancelamento da exportação;
- eixos de orientação no canto, sincronizados com a câmera, e botão para ocultar a grade.

## Formatos proprietários

Parasolid (`.x_t`/`.x_b`) e 3DXML exigem um SDK/tradutor comercial para leitura confiável. A interface já identifica esses arquivos, mas o conector não está incluído nesta versão.

## Execução local

Como o aplicativo usa módulos JavaScript e Web Workers, abra-o por um servidor HTTP:

```text
python -m http.server 8080
```

Depois acesse `http://localhost:8080`.

As bibliotecas Three.js e OpenCascade são carregadas de CDN; o modelo do usuário não é enviado a elas.

Os testes de navegador ficam em `tests/browser-tests.html`.

## Diretório compartilhado de trabalho

O diretório canônico deste projeto é `Z:\Projetos\View and Convert`, compartilhado entre os dois PCs. Todas as mudanças devem ser aplicadas diretamente nessa pasta, sem criar ou modificar cópias paralelas.

O caminho de rede correspondente é `\\192.168.15.73\Users\guizl_rede\compartilhamento\Projetos\View and Convert`.

Antes de alterar arquivos, confirme que o workspace aponta para esse compartilhamento. Se a unidade `Z:` não estiver disponível, verifique o acesso pelo caminho de rede e informe explicitamente qualquer impossibilidade de acesso. Não presuma que um checkout em outro local esteja sincronizado com a pasta compartilhada ou que um commit local tenha sido transferido para ela.

### Medições

Ative **Medir distância** e escolha **Vértices da malha** ou **Pontos na superfície**. No modo de vértices, aproxime o cursor até aparecer o destaque e clique para escolher cada extremidade. As componentes X, Y e Z seguem os eixos do modelo, independentemente da vista da câmera. Em arquivos CAD, os vértices disponíveis pertencem à malha gerada na importação. Alterar a unidade do arquivo limpa as medições; alterar a unidade de exibição apenas converte os valores.

Teste de regressão (Python, Playwright e Chrome instalados): `python tests/test_measurement.py`.

## Conversões

| Origem | Saídas | Resultado |
| --- | --- | --- |
| STEP, IGES, BREP | STEP, IGES, BREP | Usa a geometria CAD original, sem tesselação intermediária. |
| STL, OBJ, PLY, 3MF, GLB/glTF | STEP, IGES, BREP | CAD facetado: uma face plana por triângulo, sem reconstrução de curvas ou garantia de sólido fechado. |
| Qualquer formato de entrada suportado | STL, OBJ, PLY, 3MF, GLB/glTF | Exporta a malha do modelo. |

A exportação inclui **todos os corpos**, mesmo ocultos, e não aplica o plano de corte visual. A geometria e a escala são exportadas; a preservação de cores, nomes e estrutura de montagem depende do formato. A exportação CAD usa a forma agregada do arquivo, sem preservar esses metadados. OBJ não inclui pacote MTL/texturas; 3MF exporta geometria e nomes, sem materiais. Nenhum formato recupera o histórico paramétrico de construção.

A unidade do arquivo determina a escala física. STEP e IGES são normalizados em milímetros pelo leitor CAD; GLB/glTF usam metros e são tratados como tal na importação e exportação. Os demais formatos sem unidade explícita são interpretados inicialmente em milímetros; ajuste a unidade do arquivo quando necessário. A unidade de exibição das medidas não altera a exportação.

O motor adicional [OpenCascade.js](https://ocjs.org/docs/app-dev-workflow/pre-built), fixado em `2.0.0-beta.b5ff984`, é carregado sob demanda para exportar CAD (WebAssembly de aproximadamente 50 MB no primeiro uso). O arquivo permanece no navegador. Cada conversão CAD usa um worker separado, encerrado ao concluir, cancelar ou falhar para liberar a memória. Malhas densas geram muitas faces e podem exceder a memória disponível; há cancelamento e um limite de dez minutos por conversão.

Testes de download e reimportação em todos os formatos, superfícies curvas, unidades e cancelamento: `python tests/test_conversion.py`. Requer Python, Playwright e Chrome, além de internet para bibliotecas e geometrias de referência do projeto [occt-import-js](https://github.com/kovacsv/occt-import-js/tree/main/test/testfiles).

## Folha 2D

Depois de abrir um modelo, clique em **Gerar folha 2D** no topo. O painel ocupa a área do visualizador, ocultando temporariamente o 3D, com uma folha **A4 paisagem (297 × 210 mm)**. Selecione e insira as vistas superior, inferior, frontal, trás, direita, esquerda e isométrica. Use **Voltar ao 3D** para retornar ao modelo sem perder a folha. Cada vista pode ser arrastada; a escala é comum à folha, e o zoom altera apenas a ampliação na tela.

- **Linear:** escolha alinhada, horizontal ou vertical; clique em dois vértices destacados da mesma vista e depois na posição da cota.
- **Angular:** clique na primeira extremidade, no vértice central e na segunda extremidade; o quarto clique posiciona o arco.
- **Diâmetro / raio:** informe o valor manual (por exemplo, `12 mm`), clique na geometria e depois na posição do texto. Não há reconhecimento automático de círculos.
- **Mover / selecionar:** arraste vistas ou cotas. **Excluir seleção**, **Desfazer**, Delete e Ctrl+Z atuam na folha. Escape cancela a seleção de pontos em andamento.
- **PDF:** download vetorial de uma página A4 paisagem, com textos e cotas.
- **DWG:** arquivo nativo AutoCAD R2000 (`AC1015`), com linhas e textos editáveis, validado também com um leitor LibreDWG independente. As cotas são representações gráficas, não entidades DIMENSION associativas. As coordenadas ficam em milímetros da folha, no espaço de modelo, já com a escala aplicada.

As vistas incluem o modelo completo, mesmo corpos ocultos, sem aplicar o corte visual. As projeções usam as arestas e os contornos da malha importada, com teste de visibilidade amostrado; curvas ficam segmentadas e a precisão depende da tesselação. Não é uma extração exata das arestas BREP. Nas vistas ortogonais, cotas e ângulos são medidos no plano projetado; na isométrica, cotas alinhadas e ângulos usam os vértices 3D (horizontal/vertical continuam projetadas). O ângulo é o menor entre os dois segmentos, de 0 a 180 graus.

A folha fica na sessão atual: fechar/reabrir o painel preserva o trabalho; carregar outro modelo, alterar a unidade do arquivo ou recarregar a página reinicia a folha. Baixe o PDF/DWG antes disso. A unidade das cotas da folha é independente da unidade exibida no painel 3D.

Dependências carregadas sob demanda: [three-mesh-bvh 0.9.1](https://github.com/gkjohnson/three-mesh-bvh), [jsPDF 3.0.3](https://github.com/parallax/jsPDF) e [acad-ts 3.2.0](https://github.com/node-projects/acad-ts), todas com licença MIT. O processamento e a escrita dos arquivos ocorrem no navegador; os modelos não são enviados às CDNs.

Validação: `python tests/test_drawing.py` (Python, Playwright, Chrome e pypdf). Cobre as sete vistas, cotas de 40 mm/90°, anotações, escala/unidades, arraste, exclusão/desfazer, zoom, reinicialização, PDF A4 e DWG reaberto com acad-ts e LibreDWG. Defina `DRAWING_TEST_ARTIFACTS` para preservar os arquivos e a captura de tela em uma pasta de revisão.
