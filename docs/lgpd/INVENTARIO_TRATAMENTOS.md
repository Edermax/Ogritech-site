# Inventário inicial de tratamentos

| Processo | Titulares | Dados | Finalidade | Base a validar | Compartilhamento | Retenção inicial |
|---|---|---|---|---|---|---|
| Autenticação | usuários | nome, e-mail, credenciais gerenciadas | acesso e segurança | contrato / legítimo interesse | Supabase | duração da conta + registros necessários |
| Cadastro de cliente | clientes | nome, telefone, e-mail, aniversário opcional, observações | administrar relacionamento e atendimento | contrato / procedimentos preliminares | Ogritech e Supabase | 24 meses de inatividade, configurável |
| Agendamento | clientes | identificação, serviço, profissional, data, hora, status | solicitar e executar atendimento | contrato / procedimentos preliminares | estabelecimento, Ogritech e Supabase | 60 meses, configurável |
| Auditoria | usuários e clientes | ator, registro, ação, data | segurança, prevenção a fraude e responsabilização | legítimo interesse / exercício regular de direitos | Ogritech e Supabase | 24 meses, configurável |
| Direitos do titular | solicitantes | identidade, e-mail, pedido, resposta | cumprir direitos e demonstrar atendimento | obrigação legal | controlador e Ogritech | prazo necessário à obrigação e defesa |
| Demonstração | visitantes | dados fictícios no navegador | demonstrar funcionalidades | legítimo interesse | sem envio ao Supabase | até limpeza do navegador |
| Estatísticas opcionais de navegação (proposta do PR #157; produção pendente) | visitantes e usuários que permitirem a medição | identificadores aleatórios sem vínculo com conta, categorias de página/origem/dispositivo, ações previstas, marcos e horários | medir utilização e pontos de abandono em relatórios agrupados para a administração | consentimento opcional, revogável | Ogritech e Supabase | limpeza diária de eventos recebidos há mais de 90 dias; códigos de proteção contra abuso por até três dias; preferência com validade de 180 dias e identificador válido por 90 dias |

## Pendências de validação

- confirmar razão social e CNPJ das partes;
- confirmar região e transferências internacionais do Supabase;
- documentar todos os suboperadores;
- validar bases legais com cada estabelecimento;
- definir retenções específicas por setor;
- impedir uso de observações para dados sensíveis;
- revisar integrações futuras antes da ativação.
