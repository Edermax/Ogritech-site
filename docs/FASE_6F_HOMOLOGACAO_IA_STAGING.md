# Fase 6F — contrato de homologação híbrida

Status: contrato validado e publicado no staging, bloqueado operacionalmente.

Esta fase cria o limite técnico para uma futura homologação do assistente híbrido. Ela não instala segredo remoto, não habilita a Edge Function e não envia mensagens à OpenAI.

## Controles obrigatórios

- Segredo `OPENAI_API_KEY` somente no servidor; nomes de segredo público são proibidos.
- Ambiente deve declarar `OGRITECH_MENU_AI_ENV=staging`.
- Edge Function pode ser publicada apenas no staging; o gate do banco nasce desativado, com kill switch ativo e limites zerados.
- Controle global nasce com IA desativada, kill switch ativo e tetos de chamadas e custo iguais a zero.
- Cada estabelecimento precisa aderir separadamente e aceitar a versão vigente do aviso.
- Mensagens com e-mail, telefone ou indício de endereço são rejeitadas antes do provedor.
- Telemetria armazena apenas hashes e metadados, nunca a conversa bruta.
- Preços, itens, totais e envio do pedido continuam sob autoridade determinística do sistema.
- Qualquer falha retorna ao assistente da Fase 6A.

## Transparência

Aviso previsto: “Este atendimento combina respostas automáticas locais e inteligência artificial. Preços e pedidos são confirmados pelo sistema e por você.”

## Ordem segura para uma autorização futura

1. aplicar a migration somente em staging;
2. cadastrar segredos no cofre do servidor, sem copiá-los para o frontend;
3. publicar a função ainda desativada;
4. validar logs, origem e bloqueios com dados sintéticos;
5. ativar uma única empresa de teste e seu aceite;
6. fixar tetos globais de chamadas e custo;
7. retirar o kill switch por uma janela curta e monitorada.

Reversão: religar primeiro o kill switch, desativar a função, remover adesões e preservar apenas a auditoria sem conteúdo. Produção permanece fora do escopo.
