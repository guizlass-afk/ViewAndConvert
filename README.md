# View & Convert

Visualizador e conversor 3D para o toolbox de projetos mecânicos. Todo o arquivo aberto é processado localmente no navegador.

Aplicação publicada: https://guizlass-afk.github.io/ViewAndConvert/

## Recursos da primeira versão

- visualização de STL, OBJ, 3MF, GLB/GLTF, STEP, IGES e BREP;
- navegação orbital e vistas frontal, superior, lateral e isométrica;
- modos sombreado, arestas, aramado e transparente;
- medição entre dois pontos sobre a geometria;
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
