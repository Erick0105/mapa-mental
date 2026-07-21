# Construtor de Cluster de Site

Ferramenta visual (front-end puro, sem build) para montar e exportar mapas de
arquitetura de conteúdo — money page, página pilar, categorias, satélites e
núcleos (agrupamentos temáticos), com conexões entre eles. Permite exportar o
diagrama em PNG/PDF e colaborar em tempo real com outras pessoas no mesmo
quadro.

## Estrutura

```
mapa mental/
├── index.html                    estrutura da página
├── style.css                     estilos
├── script.js                     toda a lógica (canvas SVG, drag&drop, export, colaboração)
├── firebase-config.example.js    modelo do firebaseConfig (versionado)
├── firebase-config.js            firebaseConfig real, fora do git (.gitignore)
└── versoes/                      rascunhos e planos de clusters em JSON/Markdown
```

Os arquivos `.json` na raiz e em `versoes/` são exportações do próprio
construtor (botão **.json**) que podem ser reabertas com o botão **Abrir**. Os
`.md` documentam a estratégia por trás de cada cluster (não são lidos pela
ferramenta).

## Como rodar

Não há dependências nem build. Basta abrir `index.html` no navegador, ou
publicar a pasta como está (ex.: GitHub Pages).

### Publicar no GitHub Pages

1. Faça push deste repositório para o GitHub.
2. Em **Settings → Pages**, aponte para a branch/pasta onde está este
   `index.html` (ex.: `main` / `/mapa mental`, ou mova o conteúdo para a raiz
   se preferir a URL curta).
3. Acesse a URL gerada pelo GitHub Pages.

**Sobre `firebase-config.js` no Pages:** esse arquivo está no `.gitignore`
(veja "Colaboração em tempo real" abaixo), então um push normal **não** o
leva para o GitHub — o site publicado ficaria sem colaboração configurada.
Se você quer colaboração funcionando no Pages, force a inclusão dele antes
de publicar (o `.gitignore` continua valendo para todo o resto, então isso
não muda seu fluxo normal de `git add`):
```
git add -f "mapa mental/firebase-config.js"
git commit -m "Publica config do Firebase"
git push
```
Repita isso sempre que atualizar os valores em `firebase-config.js`. (O
`firebaseConfig` do Firebase Web não é secreto — quem abrir o site já
consegue ver esses valores; a proteção de verdade são as regras do
Realtime Database e o Authorized domains configurados abaixo.)

## Colaboração em tempo real (com login obrigatório)

O botão **Compartilhar** copia um link com `?room=<sala>`. Para ver ou editar
o quadro, quem abrir o link precisa **entrar com Google** (menu de perfil,
ícone no canto direito do header) usando um e-mail autorizado — sem isso,
o Firebase recusa a leitura e a escrita. Uma vez logada, a pessoa vê as
edições das outras quase em tempo real e o cursor colorido de cada uma se
movendo sobre o quadro. Tudo sincronizado via Firebase Realtime Database +
Firebase Authentication. Para ativar:

1. Crie um projeto gratuito em https://console.firebase.google.com
2. No menu lateral, abra **Realtime Database** → **Criar banco de dados**
   (pode usar "modo de teste" para começar — as regras do passo 6
   substituem isso).
3. No menu lateral, abra **Authentication** → aba **Sign-in method** →
   ative o provedor **Google**.
4. Ainda em **Authentication** → aba **Settings** → **Authorized domains**,
   adicione o domínio onde o app vai rodar (ex.: `seuusuario.github.io`).
   Sem isso o login com popup falha silenciosamente.
5. Em **Configurações do projeto → Geral → Seus aplicativos**, registre um
   app Web (ícone `</>`) e copie o objeto `firebaseConfig` que aparece. Copie
   `firebase-config.example.js` para `firebase-config.js` (mesma pasta) e
   cole os valores lá, substituindo os placeholders (`SUA_API_KEY` etc.).
   `firebase-config.js` está no `.gitignore` — suas credenciais reais nunca
   são commitadas; só `firebase-config.example.js` (com os placeholders)
   fica versionado.
6. Em **Realtime Database → Regras**, cole (troque os e-mails de exemplo
   pelos das pessoas autorizadas; duplique a linha `auth.token.email == ...`
   para cada uma):
   ```json
   {
     "rules": {
       "clusters": {
         "$room": {
           ".read": "auth != null && (auth.token.email == 'pessoa1@empresa.com' || auth.token.email == 'pessoa2@empresa.com')",
           ".write": "auth != null && (auth.token.email == 'pessoa1@empresa.com' || auth.token.email == 'pessoa2@empresa.com')"
         }
       }
     }
   }
   ```
   Isso bloqueia leitura **e** escrita para qualquer pessoa que não esteja
   logada com um dos e-mails da lista — mesmo tendo o link. Para
   adicionar/remover alguém, edite essa lista diretamente nas regras do
   Firebase (não precisa mexer no código).
7. Publique. A bolinha ao lado de "Compartilhar" indica o status: cinza sem
   configuração/login, verde conectado, vermelho e-mail sem permissão.

Sem essa configuração, o app funciona normalmente de forma local (autosave no
navegador), sem exigir login e sem sincronizar entre pessoas.

O cursor de cada pessoa some automaticamente se ela fechar a aba, sair da
conta ou ficar mais de ~12s sem mexer o mouse sobre o quadro.

## Tema (claro / escuro / sistema) e menu de perfil

O ícone de perfil no canto direito do header (uma silhueta por padrão, ou a
foto da conta depois de logado) abre um painel com:

- **Tema:** três opções — Claro, Escuro e Sistema. "Sistema" acompanha a
  preferência de claro/escuro do sistema operacional/navegador
  automaticamente (e reage se você mudar o SO enquanto o app está aberto). A
  escolha fica salva no navegador (`localStorage`) e é aplicada antes da
  página desenhar, sem "flash" do tema errado. Todas as barras de rolagem
  (painéis flutuantes, modais, barra lateral) seguem esse tema também.
- **Conta Google:** o botão "Entrar com Google" usa Firebase Authentication
  de verdade (não é só decorativo) — é o mesmo login que libera o acesso ao
  quadro colaborativo, controlado pela lista de e-mails nas regras do
  Firebase (veja a seção acima). Depois de logado, o ícone de perfil vira a
  foto da conta. Se a pessoa ainda não tiver personalizado o campo "Seu
  nome" da colaboração, o nome da conta Google preenche esse campo
  automaticamente.
- **Ajuda:** "Como utilizar" abre um pop-up com o resumo dos controles
  (fecha no X, clicando fora ou com Esc); "Adicionar feedback" abre um
  pop-up para relatar um bug ou sugerir algo, com a escolha de enviar por
  e-mail (`erickaxs0105@gmail.com`) ou WhatsApp — cada opção só abre o app
  correspondente com a mensagem pronta, quem usa decide se envia.

O botão **Abrir** (importar um `.json`) continua direto no header. Não há
mais um botão "Salvar": o autosave já roda sozinho a cada alteração (ver
seção **Exportar** abaixo para o botão que assumiu o antigo espaço dele).

## Exportar

O botão **Exportar** no header (fora do menu de perfil) abre um menu com:

- **.json:** salva o projeto inteiro para reabrir depois com **Abrir**.
- **.md / .csv:** lista de páginas com tipo, núcleo, status, notas e
  conexões — útil para levar o cluster a redatores/devs. Núcleos com nota
  também aparecem (no `.md` como uma linha "_Nota: ..._" sob o título do
  núcleo; no `.csv` como uma linha própria do tipo "Núcleo").
- **PNG / PDF:** abre uma pré-visualização interativa em tela cheia com o
  cluster já enquadrado, antes de gerar o arquivo:
  - dropdown **Legenda** — "Com legenda" ou "Sem legenda"; com legenda
    ativa, basta arrastá-la para qualquer posição dentro do preview (solte
    e o enquadramento se ajusta sozinho para caber a nova posição);
  - dropdown **Tema** — Claro ou Escuro, independente do tema do app (parte
    do tema atual como padrão);
  - só ao clicar em **Exportar** (dentro do preview) o arquivo é realmente
    gerado e baixado — **Cancelar** ou fechar descarta as escolhas feitas
    ali. A posição da legenda, se ela aparece e o tema escolhido ficam
    salvos para a próxima exportação.
  - o status de cada página (ver "Notas e status" abaixo) aparece como uma
    bolinha colorida no canto do nó, com uma entrada correspondente na
    legenda — igual nos outros formatos de exportação.

## Uso básico

- **Adicionar:** clique numa categoria na barra lateral.
- **Mover:** arraste o item.
- **Conectar:** passe o mouse sobre um item e arraste o ponto azul até outro.
- **Renomear:** duplo-clique no item.
- **Direção da seta:** duplo-clique na linha.
- **Apagar:** selecione e tecle `Delete`.
- **Núcleo:** crie em "Agrupamento", arraste itens para dentro; arraste a aba
  do título para mover tudo junto, e as alças para redimensionar. Selecione
  o núcleo para personalizar a cor no painel flutuante (cores prontas ou
  uma cor customizada).
- **Mover o quadro:** arraste com o botão direito ou o botão do meio
  (scroll) do mouse. **Zoom:** role o scroll — em direção ao cursor, tanto
  sobre o quadro quanto sobre o minimapa — ou use os botões +/−.
- **Seleção múltipla:** `Ctrl+clique` alterna páginas na seleção; arrastar
  com o botão esquerdo sobre o vazio do quadro abre uma seleção por caixa
  (sem `Ctrl` ela substitui a seleção atual, com `Ctrl` soma a ela). Com
  várias selecionadas, arrastar move o grupo e `Delete` apaga todas de uma
  vez.
- **Desfazer / Copiar / Colar:** `Ctrl+Z` / `Ctrl+C` / `Ctrl+V`.
- **Buscar:** `Ctrl+F` abre um painel de busca flutuante no canto superior
  direito do quadro; ele destaca (e amplia) as páginas cujo nome bate com o
  texto digitado, `Enter` enquadra os resultados e `Esc` fecha a busca.

## Outros recursos

- **Barra lateral recolhível:** o botão com a seta na borda da barra lateral
  recolhe/expande o painel de categorias; o estado fica salvo entre sessões.
- **Painel da seleção flutuante:** ao selecionar uma página ou um núcleo, um
  painel flutuante aparece sobre o quadro (notas/status para página,
  notas/cor para núcleo); arraste pelo topo dele para deixá-lo onde quiser
  — a posição se mantém ao trocar de seleção — e ele some ao desselecionar.
  O scroll do mouse rola o conteúdo do painel normalmente, sem mexer no
  zoom do quadro por baixo.
- **Hover na paleta:** passar o mouse sobre um tipo de página na barra
  lateral amplia todas as páginas desse tipo no quadro.
- **Notas e status:** tanto páginas quanto núcleos têm um campo de notas no
  painel flutuante, com pré-visualização de Markdown em tempo real
  (negrito, itálico, links, listas, títulos, código) enquanto você digita.
  Páginas também têm um status — Rascunho, Em produção, Publicado ou
  Precisa refatorar (para uma página que já existe mas ficou desatualizada
  e precisa de retrabalho) — com um badge colorido visível no próprio nó.
  Notas e status são incluídos em todos os formatos de exportação
  (`.md`, `.csv`, `.json`, PNG e PDF).
- **Confirmação:** os botões Exemplo, Limpar e Organizar pedem confirmação
  antes de agir, já que substituem ou reorganizam o conteúdo do quadro.
- **Organizar:** botão no header reorganiza automaticamente páginas soltas e
  núcleos em hierarquia, a partir das conexões existentes.
- **Minimapa:** no canto inferior esquerdo do quadro, mostra a visão geral e
  a área visível atual; clique ou arraste nele para navegar rapidamente, ou
  role o scroll sobre ele para zoom (centralizado no ponto sob o cursor).

## Checklist de melhorias (em andamento)

- [x] Melhorar o contraste dos ícones das páginas no modo claro e escuro
- [x] Permitir personalizar a cor de cada núcleo
- [x] Botão para recolher/expandir a barra lateral (ícone "<" / ">")
- [x] Busca só abre com `Ctrl+F`, em painel flutuante no canto superior direito
- [x] Painel da página selecionada vira flutuante, arrastável, some ao
      desselecionar e mantém a posição ao trocar de seleção
- [x] Tela de confirmação para os botões Exemplo, Limpar e Organizar
- [x] Ícone de perfil visível mesmo deslogado (ícone padrão), no lugar da
      engrenagem
- [x] Exportar (.json/.md/.csv/PNG/PDF) reunido num só menu (depois movido
      do menu de perfil para o botão "Exportar" próprio — ver checklist mais
      abaixo)
- [x] "Como utilizar" em pop-up fechável com X
- [x] "Adicionar feedback" (bug/sugestão) enviando por e-mail ou WhatsApp, à
      escolha de quem usa
- [x] Seleção múltipla com `Ctrl+clique` (em vez de `Shift+clique`)
- [x] Seleção por caixa ao arrastar com o botão esquerdo no vazio do quadro;
      mover o quadro passa a ser botão direito ou botão do meio do mouse
- [x] Scroll vira zoom sozinho (no quadro e no minimapa, em direção ao
      cursor); mover o quadro é sempre por botão direito/meio do mouse
- [x] Barras de rolagem seguem o tema claro/escuro em qualquer painel
- [x] Painel flutuante sem barra de rolagem lateral indevida; scroll do
      mouse sobre ele rola o painel em vez de mexer no zoom do quadro
- [x] Notas com pré-visualização de Markdown em tempo real, disponíveis
      também nos núcleos (antes só nas páginas)
- [x] Botão "Exportar" próprio no header, fora do menu de perfil, reunindo
      .json/.md/.csv/PNG/PDF (e o "Salvar" manual foi removido — o autosave
      já cobria isso)
- [x] Pré-visualização interativa ao exportar PNG/PDF: legenda arrastável e
      tema (claro/escuro) escolhidos na hora, independente do tema do app
- [x] Novo status "Precisa refatorar"; status das páginas passa a aparecer
      em todos os formatos de exportação, incluindo PNG/PDF (com legenda)
- [x] Config do Firebase movida para `firebase-config.js`, fora do git

### Ideias novas 

- [ ] Atalho de teclado para focar rapidamente o campo de nome de um núcleo
      recém-criado (hoje já abre o rename, mas vale revisar o fluxo após o
      painel flutuante)
- [ ] Paleta de cores de núcleo com opção "aleatória" e nome salvo por cor
      (ex.: identificar núcleos por cor em vez de só por nome)
