# Tema claro em Assinatura e dados

## Reprodução e correção

Na versão publicada, escolher Claro altera corretamente o estado do seletor e as cores calculadas pelo CSS. Porém, com o escurecimento automático do navegador ativado, a pintura final continua escura. A reprodução no Chromium via `Emulation.setAutoDarkModeOverride` mostrou exatamente essa divergência: seletor Claro e cartões pretos, embora `getComputedStyle` informasse fundo branco.

A escolha explícita de Claro agora declara `color-scheme: only light` na raiz do documento e no corpo do painel. Isso impede a transformação automática das cores, mantendo a opção Escuro existente. A técnica é documentada pelo [Chrome](https://developer.chrome.com/blog/auto-dark-theme). As referências das folhas de estilo compartilhadas foram versionadas para renovar o cache.

## Verificação

- O novo teste `npm run test:account-theme-browser` falhou antes da correção ao comparar os pixels pintados com e sem Auto Dark.
- Após a correção, passou em 390 e 1440 pixels, para Claro e Escuro, com preferência de sistema escura e escurecimento automático ativo.
- Confere seleção, fundo real, persistência após recarregar, diálogo de senha, ausência de transbordamento e erros JavaScript.
- O ensaio anterior `npm run test:panel-theme-browser` passou nas 38 cenas, preservando contraste no escuro e aparência clara após alternância.
- O CI executa o novo teste e arquiva suas capturas junto das evidências de tema existentes.

Capturas: `outputs/panel-theme-review/account-explicit/`. A comparação das versões anteriores fica em `outputs/account-auto-dark-before-light.png` e `outputs/account-before-light.png`. Dados e autenticação dos testes são simulados; nenhuma assinatura, cobrança ou dado de cliente é alterado.
