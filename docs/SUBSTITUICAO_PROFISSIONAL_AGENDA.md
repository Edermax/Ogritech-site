# Substituição de profissional em um agendamento

## Objetivo

Preservar o atendimento quando o profissional escolhido não puder comparecer, sem trocar o responsável ou alterar o preço sem o consentimento do cliente.

## Fluxo aprovado

Ao iniciar o cancelamento de um agendamento solicitado ou confirmado, o profissional pode:

1. sugerir outro profissional no mesmo horário;
2. sugerir outro horário com ele próprio;
3. cancelar definitivamente.

A primeira versão implementará a sugestão de outro profissional no mesmo horário. Reagendamento de data ou horário será tratado em uma entrega separada para não misturar duas operações com regras de disponibilidade diferentes.

## Regras da sugestão

- O profissional sugerido deve estar ativo, pertencer ao mesmo estabelecimento, executar o serviço e estar disponível por toda a duração do atendimento.
- Um funcionário só pode iniciar a substituição dos próprios atendimentos. Proprietário e administrador podem iniciar a substituição de qualquer atendimento do estabelecimento.
- A troca nunca é confirmada automaticamente.
- Enquanto o cliente não responder, o agendamento original recebe o estado de alteração pendente e não é cancelado.
- O horário do substituto fica reservado temporariamente para evitar uma oferta impossível de cumprir.
- A oferta expira no prazo configurado pelo estabelecimento. O padrão inicial será de duas horas.
- Uma oferta expirada ou recusada libera imediatamente o horário reservado.
- Todas as ações registram autor, horário, profissional original, profissional sugerido, resposta do cliente e eventual diferença de preço.
- Só pode existir uma oferta ativa por agendamento. Uma nova sugestão substitui a anterior e registra o motivo no histórico.

## Mensagem ao cliente

> **Precisamos alterar seu atendimento**  
> João não poderá atendê-lo em 15/09 às 14h. O profissional Carlos está disponível no mesmo horário para realizar Corte + Barba por R$ 70,00.
>
> **[Aceitar Carlos] [Escolher outro(a) profissional] [Cancelar]**

Os nomes, data, horário, serviço e preço são dinâmicos.

## Respostas do cliente

### Aceitar o profissional sugerido

- Revalidar a disponibilidade no momento do aceite.
- Transferir o agendamento de forma transacional.
- Manter data, horário e serviço.
- Confirmar a troca e notificar cliente, profissional original, substituto e gestor.
- Preservar o preço original quando a alteração partir do estabelecimento. Qualquer valor diferente precisa aparecer antes do aceite.

### Escolher outro(a) profissional

- Exibir apenas profissionais ativos, habilitados para o serviço e disponíveis no mesmo horário.
- Mostrar o preço aplicável antes da escolha.
- Exigir confirmação expressa do cliente.
- Se não houver outro profissional disponível, oferecer outro horário ou cancelamento.

### Cancelar

- Pedir confirmação final.
- Cancelar o agendamento e liberar os horários reservados.
- Preservar eventual crédito ou sinal conforme a política comercial.
- Registrar que o cancelamento ocorreu após indisponibilidade do estabelecimento.

## Telefone e WhatsApp

- O celular com DDD é obrigatório para confirmar o agendamento.
- Consentimento operacional para WhatsApp é separado de consentimento promocional.
- Mensagens operacionais cobrem criação, confirmação, lembrete, alteração, substituição e cancelamento.
- O cliente deve conseguir responder pela página segura mesmo que não tenha WhatsApp ou não autorize mensagens nesse canal.
- O telefone não pode aparecer em catálogos públicos, logs ou notificações destinadas a pessoas sem permissão.

## Estados mínimos

| Estado | Significado |
| --- | --- |
| `pending` | Oferta criada e aguardando resposta |
| `accepted` | Cliente aceitou e a transferência foi concluída |
| `declined` | Cliente recusou a sugestão |
| `expired` | Prazo terminou sem resposta |
| `cancelled` | Oferta retirada pelo estabelecimento |

O status principal do agendamento continua `requested` ou `confirmed` enquanto a oferta está pendente. A substituição é uma entidade separada, evitando acrescentar combinações ambíguas à máquina de estados existente.

## Critérios de aceite

- O cliente pode consultar horários antes de autenticar.
- Ao tentar concluir uma reserva, pode entrar ou criar sua conta e deve informar celular válido.
- Um funcionário não consegue sugerir substituição para atendimento de outro funcionário.
- Não é possível sugerir profissional sem vínculo com o serviço ou indisponível no horário.
- Duas pessoas não conseguem aceitar o mesmo horário em concorrência.
- Aceite, recusa, expiração e cancelamento são idempotentes.
- O cliente nunca recebe dados de outros clientes.
- A mensagem usa exatamente os botões `Aceitar {nome}`, `Escolher outro(a) profissional` e `Cancelar`.
- Diferença de preço nunca é aplicada silenciosamente.
- Falha no envio de WhatsApp não impede a resposta pelo link seguro.
- Testes cobrem autorização, conflito concorrente, expiração e trilha de auditoria.

## Sequência de implementação

1. Criar tabela de ofertas de substituição e restrição de uma oferta ativa por agendamento.
2. Criar operações transacionais para sugerir, aceitar, recusar, escolher outro profissional, expirar e cancelar.
3. Integrar o painel ao fluxo de cancelamento.
4. Expor a oferta no link seguro do cliente.
5. Gerar notificações internas e colocar e-mail/WhatsApp na fila durável.
6. Implementar expiração automática e liberar reservas temporárias.
7. Adicionar testes de banco, interface e jornada sintética.
8. Atualizar Termos de Uso e Política de Privacidade antes da ativação pública.
