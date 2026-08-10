const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Quiz Application API',
      version: '1.0.0',
      description: 'API documentation for the Node.js Quiz Application',
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: ['./src/routes/*.js'], // Look for swagger comments in the routes files
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
