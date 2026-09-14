// Produção: informe somente a URL pública da API, sem token ou credencial.
// A hospedagem do cardápio é independente do painel; a URL abaixo pode apontar
// para o serviço de pedidos escolhido na implantação.
// Exemplo: window.__TWENY_MENU_API__ = 'https://api.seudominio.com.br/api/cardapio/minha-loja';
// O endpoint é público, mas a autenticação Caixa -> API fica somente no Gestor/Caixa.
window.__TWENY_MENU_API__ = window.__TWENY_MENU_API__ || 'https://tweny-cardapio-api.twenytwopdv.workers.dev/api/cardapio/milk-shake-up-rg';
