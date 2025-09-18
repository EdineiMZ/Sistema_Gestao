module.exports = {
    showSobre: (req, res) => {
        res.render('pages/sobre', {
            pageTitle: 'Sobre nós',
            pageDescription: 'Conheça a história, os valores e a visão que impulsionam o desenvolvimento contínuo do nosso sistema de gestão.'
        });
    },
    showContact: (req, res) => {
        res.render('pages/contact', {
            pageTitle: 'Contato',
            pageDescription: 'Estamos aqui para ajudar em cada etapa. Escolha o canal ideal e fale com a equipe de atendimento sempre que precisar.'
        });
    },
    showAgendamentos: (req, res) => {
        res.render('pages/agendamentos', {
            pageTitle: 'Central de Agendamentos'
        });
    },
    showTerms: (req, res) => {
        res.render('pages/terms', {
            pageTitle: 'Termos de Uso & Privacidade',
            pageDescription: 'Transparência sobre como protegemos seus dados, garantimos conformidade e oferecemos uma experiência segura.'
        });
    }
};
