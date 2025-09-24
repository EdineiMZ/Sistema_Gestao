const request = require('supertest');
const { USER_ROLES } = require('../../src/constants/roles');

const buildTestUser = (overrides = {}) => ({
    id: overrides.id ?? 1000,
    name: overrides.name || 'Administrador Teste',
    email: overrides.email || 'admin.teste@example.com',
    role: overrides.role || USER_ROLES.ADMIN,
    active: overrides.active !== false,
    profileImage: overrides.profileImage ?? null,
    companyId: overrides.companyId ?? null
});

const authenticateTestUser = async (app, overrides = {}) => {
    const agent = request.agent(app);
    const user = buildTestUser(overrides);
    const payload = { user };

    if (Array.isArray(overrides.notifications)) {
        payload.notifications = overrides.notifications;
    }

    await agent
        .post('/__test/login')
        .send(payload);

    return { agent, user };
};

const logoutTestAgent = async (agent) => {
    await agent.post('/__test/logout');
};

module.exports = {
    authenticateTestUser,
    buildTestUser,
    logoutTestAgent
};
