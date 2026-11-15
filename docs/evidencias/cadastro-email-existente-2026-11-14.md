# Cadastro com e-mail de conta existente — 14/11/2026

A mensagem “Não foi possível preparar seu cardápio” foi causada por `23505` no
índice `saas_clients_owner_email_key`. O e-mail já pertencia a uma conta de Agenda
arquivada; a conta Auth e o perfil continuavam existentes. A restrição de e-mail
também considera registros arquivados. Não era falha da página exclusiva de
Cardápio ou do plano escolhido.

A checagem agora identifica o conflito antes de criar signup/estabelecimento ou
consumir a confirmação de telefone. O retorno é HTTP 409 com uma mensagem
específica. A consulta usa apenas o identificador necessário e trata o endereço
literalmente, sem interpretar `_`/`%` como curingas. Falha de consulta retorna
503 sem provisionamento. A colisão concorrente no índice também recebe 409 e
libera os registros provisórios criados pela própria tentativa.

As três páginas de cadastro preservam os campos e oferecem ações para entrar
na conta existente ou corrigir o e-mail. Conta arquivada precisa de recuperação
antes de reutilizar o mesmo endereço. Não há exclusão, reativação ou transferência
automática de contas, nem alteração de senha, histórico ou regras do teste grátis.

Conferência de produção: um cadastro antigo correspondente, zero signups
pendentes para o endereço e permissão de leitura do serviço confirmada. Os nomes,
endereços e identificadores particulares consultados não foram registrados neste
documento. Saúde do projeto sem alertas; sem mudança de esquema ou permissões.

Validação: 431 testes Node, incluindo 62 testes do handler real. Novos cenários
cobrem conflito antes de provisionar, consulta indisponível e colisão concorrente.
Dezesseis cenários de navegador passaram, incluindo mensagem, preservação de
campos, foco na correção e reenvio simulado com outro e-mail. Nenhuma conta,
mensagem ou cobrança real foi criada nos testes. Backend conferido contra a
versão anterior de produção (22) e homologação (33) antes da publicação.

A escolha entre recuperar o acesso antigo e cadastrar com outro e-mail foi
solicitada ao responsável. O tratamento correto do conflito não equivale à
recuperação ou à criação de uma nova conta.
