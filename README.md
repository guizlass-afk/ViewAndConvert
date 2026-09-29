# View & Convert

Visualizador e conversor 3D para o toolbox de projetos mecânicos. Todo o arquivo aberto é processado localmente no navegador.

Aplicação publicada: https://guizlass-afk.github.io/ViewAndConvert/

## Recursos da primeira versão

- visualização de STL, OBJ, 3MF, GLB/GLTF, STEP, IGES e BREP;
- navegação orbital e vistas frontal, superior, lateral e isométrica;
- modos sombreado, arestas, aramado e transparente;
- medição entre vértices da malha ou pontos na superfície, com distância linear e componentes absolutas X, Y e Z;
- corte de seção nos eixos X, Y e Z;
- dimensões gerais, área, volume aproximado, vértices e triângulos;
- árvore de componentes com controle de visibilidade;
- conversão e download em STL binário, OBJ e GLB;
- importação STEP/IGES/BREP em Web Worker para manter a interface responsiva.

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
