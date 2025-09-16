module.exports = {
    showSobre: (req, res) => {
        res.render('pages/sobre');
    },
    showContact: (req, res) => {
        res.render('pages/contact');
    },
    showAgendamentos: (req, res) => {
        res.render('pages/agendamentos');
    }
};
