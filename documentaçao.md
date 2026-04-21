DOCUMENTAÇÃO DO PROJETO GUITAR APP (CURSOR CONTEXT)
1. REGRAS ABSOLUTAS PARA O CURSOR (IA GERADORA)
Nunca adicione comentários em nenhum bloco de código gerado.
O sistema inteiro deve rodar no lado do cliente, sendo 100% offline, compilado inicialmente como um aplicativo Desktop, mas com arquitetura de componentes pronta para futura expansão Mobile.
O custo de infraestrutura e servidor deve ser estritamente zero.
Priorize sempre bibliotecas gratuitas, leves e de código aberto.
A arquitetura de busca e processamento deve aplicar os melhores conceitos de análise de algoritmos para garantir acesso em tempo constante $O(1)$ aos dados locais, sem travamentos na interface.
2. STACK TECNOLÓGICA
Framework Base: React com Vite e TypeScript (obrigatório em todo o projeto).
Empacotamento Desktop: Tauri (recomendado por ser extremamente leve e gratuito) ou Electron, para encapsular o Vite como um aplicativo de computador nativo.
Estilização: Tailwind CSS.
Estado Global: Zustand.
Ícones: Lucide React.
Áudio e Manipulação: Web Audio API nativa e Tone.js.
Afinador: pitchfinder.
Banco de Dados: Supabase (Plano Free) restrito apenas a uma tabela simples para o ranking mundial.
3. DESIGN SYSTEM E IDENTIDADE VISUAL
Fundo Principal: 121212
Fundo Secundário (Cards): 1A1A1A
Destaques e Glow (Acordes ativos): FFB300
Alertas (Tempo forte do metrônomo): D32F2F
Texto Base: F5F5F5
Bordas e Divisórias: 333333
Fontes de UI: Inter ou Roboto.
Fontes de Dados (BPM, Cifras): Fira Code ou Roboto Mono.
Formas: rounded-xl para cards, rounded-lg para botões. Transições: duration-200 ease-in-out.
Efeito principal: Elementos ativos não usam sombra comum, mas sim um glow luminoso usando a cor FFB300.
4. MODELOS DE DADOS JSON (ESTRUTURA $O(1)$)
Banco de Músicas (tracks.json): Estrutura em Hash Map (objeto JSON onde a chave é o ID, ex: "track_123": { ... }) contendo title, style, bpm, key, audio_path e um array de chords (com time e chord).
Banco de Timbres (tones.json): Estrutura em Hash Map focado em receitas IK Multimedia. Conterá a banda, o modelo do TONEX e a cadeia exata do Amplitube 5. Foco inicial em timbres de blues e bandas como Guns N' Roses e Black Sabbath.
5. MÓDULOS E FUNCIONALIDADES COMPLETAS
Player Sincronizado: Leitura do áudio nativo com exibição do acorde no tempo exato.
Metrônomo Integrado: Pulsos gerados pela Web Audio API.
Hub de Timbres: Busca de presets com instruções de equalização.
Tap Tempo Híbrido: Importação de MP3 local onde o usuário clica para marcar as mudanças.
Afinador Cromático: Captura nativa do microfone do dispositivo.
Looper de Ideias: Gravação via MediaRecorder API.
Pitch e Time Stretch: Controles do Tone.js para mudar tom e velocidade das backing tracks.
Dicionário Visual de Escalas: Braço virtual de 22 casas, estruturado para a visualização de quem toca em uma Les Paul Michael, iluminando o shape baseado no acorde atual.
Diário de Bordo: Gráficos de evolução de BPM salvos no localStorage.
Desafio Diário: Tarefas baseadas em semente temporal com ranking de dias seguidos (streak) conectado ao Supabase.
6. ESTRUTURA DE DIRETÓRIOS OBRIGATÓRIA
/assets: Arquivos de áudio e imagens locais.
/components: Componentes visuais isolados.
/data: Arquivos estáticos estruturados em JSON.
/features: Blocos complexos de lógica (Afinador, Looper, Player).
/hooks: Hooks de sincronização de áudio e tempo.
/pages: Telas completas para o roteamento.
/store: Arquivos de configuração do Zustand.
/utils: Conversores de tempo e funções matemáticas.
7. ESQUEMA DE NAVEGAÇÃO
Utilizar react-router-dom configurado com MemoryRouter ou HashRouter (obrigatório para evitar quebras de rota dentro de aplicativos compilados via Tauri/Electron).
Rota / : Dashboard, resumo e Desafio Diário.
Rota /practice : Player de tracks, Looper e Importador Híbrido.
Rota /tools : Metrônomo e Afinador.
Rota /tones : Hub de busca Amplitube/TONEX.
Rota /scales : Dicionário interativo.
Rota /log : Gráficos e histórico.
8. ESTADO GLOBAL (ZUSTAND STORE)
currentTrack: Objeto da música em reprodução.
isPlaying: Status booleano do player.
globalBpm: Número inteiro do tempo do sistema.
activeChord: String com a cifra atual.
userStats: Dados de streak e BPM máximo. Obrigatório o uso do middleware persist do Zustand.
9. DEPENDÊNCIAS EXATAS (package.json)
O Cursor deve instalar estritamente: react-router-dom, zustand, lucide-react, tone, pitchfinder, @supabase/supabase-js, tailwindcss, postcss, autoprefixer e as dependências do empacotador desktop escolhido (ex: @tauri-apps/api, @tauri-apps/cli).
10. ESQUEMA DO BANCO DE DADOS (SUPABASE)
Assumir a existência de uma única tabela: daily_ranking.
Colunas: id (UUID, PK), username (Texto), streak_count (Inteiro), last_active (Data/Hora). Nenhuma operação de join deve ser gerada no código.
11. TRATAMENTO DE ERROS E FALLBACKS
Microfone: Implementar try/catch rigorosos no navigator.mediaDevices.getUserMedia. Se negado, exibir aviso em vermelho (D32F2F) e desabilitar botões de gravação sem quebrar o app.
Arquivos Locais: Se o áudio falhar, travar em 0:00 e exibir "Erro de Arquivo".
12. COMPORTAMENTO RESPONSIVO E USABILIDADE
Desktop-First com Visão de Futuro: A interface primária deve aproveitar o espaço de monitores de computador, mas o uso de breakpoints do Tailwind (md:, lg:) é obrigatório desde o dia 1 para garantir que o layout colapse perfeitamente para a futura versão Mobile.
Braço da guitarra deve possuir overflow-x-auto para rolar as 22 casas sem quebrar o layout quando a janela for redimensionada.
13. PONTO DE ENTRADA E INICIALIZAÇÃO
main.tsx é o único ponto de montagem.
O cliente Supabase deve ser inicializado isoladamente em /utils.
A inicialização do AudioContext e Tone.start() só devem ocorrer após o primeiro clique do usuário no app (política de autoplay).
14. COMPILAÇÃO, EMPACOTAMENTO E RESPONSABILIDADE DA IA
O Cursor é integralmente responsável por gerar todo o código-fonte da aplicação (componentes, telas, lógicas, roteamento e integrações com Tauri/Electron e Supabase).
A saída final deve ser a base de código pronta para ser executada como aplicativo de computador.
Nenhuma ação fora do código (como criar o projeto manualmente no painel web do Supabase ou instalar dependências nativas no sistema operacional) será exigida da IA, mas ela deve fornecer toda a estrutura de código necessária para que o app funcione e compile perfeitamente.