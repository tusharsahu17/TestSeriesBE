const validate = (schema, property = 'body') => {
  return (req, res, next) => {
    const { error } = schema.validate(req[property], { abortEarly: false });
    if (error) {
      const details = error.details.map((i) => i.message);
      return res.status(400).json({ message: 'Validation Error', details });
    }
    next();
  };
};

module.exports = { validate };
