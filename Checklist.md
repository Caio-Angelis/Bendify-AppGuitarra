Bendify: Status de Desenvolvimento e Roadmap Técnico
Visão Geral do Projeto

Nome: Bendify

Plataformas: Desktop (Windows .exe) e Web (Landing Page)

Stack Principal: React, Vite, TypeScript, Tailwind CSS, Supabase, Electron, Tone.js

Fase Atual: Lançamento da v1.0 Desktop e início da Fase 2 (RPG, Social e Monetização)

Módulo 1: Core Técnico e Infraestrutura
Status: [Concluído]

Setup e Empacotamento Desktop: Electron (Main/Renderer), HashRouter, instalador NSIS.

Segurança e Acessos: CSP estrito (worker-src), isolamento de contexto, permissão de microfone.

Autenticação: Integração Google OAuth e protocolo bendify:// para callbacks locais.

Processamento de Áudio (DSP): Tone.js, sincronização de UI (Tone.Draw), detecção de pitch em tempo real (Pitch Strike).

Distribuição: Repositório privado (código) e público (binários no GitHub Releases).

Módulo 2: Distribuição e Presença Digital
Status: [A Fazer]

Landing Page: SPA em Vite/Tailwind focada em conversão, com link de download direto bypassando telas intermediárias.

Hospedagem Web: Deploy automatizado na Vercel.

Módulo 3: Economia, Customização e Marketplace
Status: [A Fazer]

Moedas Virtuais: * Credits: Ganhos jogando e praticando.

Premium Coins: Compradas com dinheiro real (monetização), usadas para acelerar a compra de cosméticos, criar Guildas ou alterar nome de usuário.

Loja de Cosméticos: Interface para compra e equipamento de roupas e guitarras (ex: modelos Les Paul, Stratocaster). Bloqueio de itens por nível.

Crafting e Loot: Conversão de tempo de prática em "materiais" (ex: válvulas, madeira de mogno, cordas de aço). Exigência de acúmulo de materiais de longo prazo para "forjar" itens cosméticos raros no inventário.

Marketplace Interno (Creator Economy): Espaço para jogadores avançados venderem trilhas de treino, backing tracks customizadas ou licks por moedas. O sistema retém uma porcentagem (taxa de transação) como afundadouro de moedas e economia sustentável.

Módulo 4: Ecossistema Social e Competitivo
Status: [A Fazer]

Conexões: Sistema de busca de usuários, envio e aceite de solicitações de amizade.

Times / Guildas: Criação de equipes com nome, escudo e líder.

Batalha de Bandas (Guerras de Times): Eventos competitivos em temporadas de uma semana. Times disputam no ranking somando tempo de prática coletiva, XP ou streak (ofensiva). Gera pressão social para retenção. Recompensas: baús de recursos e troféus.

Módulo 5: Jogabilidade Gamificada e Desafios
Status: [A Fazer]

Corrida de Escalas (Scale Runner): Integração do Pitch Strike com o metrônomo para leitura guiada. O usuário deve tocar uma sequência predefinida (ex: shape 1 da pentatônica) dentro de uma janela de tempo exata (gabarito). Sistema de feedback em tempo real (Perfect, Good, Miss) e aceleração de BPM automática ao acertar a volta completa (Deathmatch).

Boss Fights Temáticas: Eventos especiais de fim de semana exigindo metas extremas para derrotar "Chefões" (ex: Boss do Heavy Metal exige sobrevivência em metrônomo de alto BPM; Boss do Blues exige precisão absoluta nos bends e notas do Pitch Strike).

Conquistas e Títulos (Achievements): Sistema de badges desbloqueáveis por marcos técnicos. Exemplo: "Speed Demon" ao tocar a pentatônica no BPM máximo sem erros na Corrida de Escalas.