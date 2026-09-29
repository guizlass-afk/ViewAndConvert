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
