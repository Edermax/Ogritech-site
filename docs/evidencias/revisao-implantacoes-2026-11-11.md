# Revisão das implantações recentes — 11/11/2026

Base revisada: `fc1a8e6` (tema claro cyan, PR #100), incluindo instalação do app, Ajudante, navegação e notificações.

## Correções

- O Ajudante sobrepunha em 13 px a navegação inferior em celulares de 390 e 520 px. A janela agora termina acima da barra e sua camada fica acima da navegação. A área segura do dispositivo é respeitada.
- As etapas de criação quebravam palavras na largura de tablet. Entre 721 e 1100 px, as etapas passam a ocupar três colunas. Os rótulos permanecem inteiros.
- O campo de e-mail do Ajudante da página pública ainda usava o tema escuro. Telefone e e-mail agora compartilham fundo branco, texto escuro de 16 px e indicação visível de foco. O Ajudante operacional do painel continua sem formulário de contato ou envio de e-mail.
- As referências versionadas dos arquivos alterados foram atualizadas para evitar reutilização do CSS anterior.

## Verificação

- 375 testes automatizados passaram; validações estáticas e política de migrações conferidas.
- Inspeção responsiva em 390×640, 520×640, 720×500, 768×700, 1024×768 e 1440×500: sem rolagem horizontal, rótulos de criação quebrados ou sobreposição da janela do Ajudante com a navegação inferior.
- Jornada completa no navegador com HTML, CSS e controladores reais, em ambiente local isolado: desktop, tablet e celular. Cobriu login de proprietário e funcionário, criação, opt-in/opt-out de notificações, publicação, vitrine/carrinho, revisão de rascunho, recuperação de falha ao salvar e confirmação/conclusão de pedidos. Nenhum erro JavaScript; nenhuma escrita em produção. Auth, banco e limite do sistema operacional de push foram simulados.
- O ensaio de jornada foi atualizado para reproduzir o estado de carregamento do painel, medir os rótulos reais das abas e incluir tablet e sobreposição do Ajudante como regressões.
- Instalador: perfil novo do navegador real recebeu `beforeinstallprompt` e acionou o método nativo com gesto do usuário preservado, sem erros de instalabilidade. A instalação no sistema operacional não foi confirmada, portanto esse teste não criou um aplicativo no dispositivo.
- Antes das correções, os arquivos publicados foram comparados ao código da base revisada; carrossel e FAQ públicos funcionaram em 390 e 1440 px, sem erros JavaScript ou rolagem horizontal.

Os ajustes são de apresentação. Não alteram nomes, fotos, preços ou cadastros dos clientes, nem introduzem mudanças de banco de dados.
