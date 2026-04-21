Fase 1: Aquisição e Distribuição (Imediato)
Nenhum sistema avançado importa se não houver usuários.

Landing Page (Módulo 2): Criar e hospedar na Vercel com o link direto de download do GitHub Releases.

Fase 2: Fundação da Economia e Retenção Básica (Core Gamification)
O jogador precisa ter como ganhar e gastar antes de interagir com os outros.
2. Moeda Interna (credits) e Nível (Módulo 3): Alterar tabela de usuários no Supabase e atualizar estado global (Zustand). Vincular o ganho de créditos ao tempo de uso do metrônomo/prática.
3. Loja Básica e Inventário (Módulo 3): Criar tabelas shop_items e user_inventory. Fazer interface para compra e equipamento de itens simples (ex: cores de interface, skins básicas).
4. Scale Runner (Módulo 5): Unir o Pitch Strike ao Tone.js. Criar a mecânica de gabarito de escalas e janela de tolerância. Esta será a principal fonte de diversão mecânica e de geração de credits do app.
5. Conquistas Básicas (Módulo 5): Troféus por atingir BPMs específicos no Scale Runner. Recompensam o jogador com grandes injeções de créditos.

Fase 3: Expansão Social (Network)
Usuários retidos começam a convidar outros.
6. Sistema de Conexões (Módulo 4): Criar tabela friend_requests. Interface para buscar usuários e adicionar amigos.
7. Times / Guildas (Módulo 4): Tabelas teams e team_members. Permitir a criação de times (cobrando credits do usuário para criar, atuando como um "ralo" para a economia).

Fase 4: Sistemas Avançados (Mid/End-game)
Para jogadores já engajados e com times formados.
8. Crafting e Loot (Módulo 3): Inserir drops de materiais (madeira, válvulas) ao completar o Scale Runner. Criar lógica de forja no inventário para itens de alto nível (ex: Les Paul cosmética).
9. Batalha de Bandas (Módulo 4): Lógica de pontuação semanal somando XP dos membros do time. Interface de ranking entre guildas.
10. Boss Fights (Módulo 5): Eventos temporários utilizando a engine do Scale Runner com metas extremas.

Fase 5: Monetização e Creator Economy
Última etapa, aplicada quando o ecossistema tem valor percebido.
11. Moeda Premium (Módulo 3): Integração com gateway de pagamento (Stripe/Mercado Pago) para compra de moedas via dinheiro real.
12. Marketplace Interno (Módulo 3): Sistema de upload de backing tracks e treinos criados por usuários, cobrando taxa de transação.