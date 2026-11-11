const paymentModel = require('../models/paymentModel');

const ALLOWED_PAYMENT_STATUSES = ['PENDING', 'SUCCESS', 'FAILED', 'REFUNDED'];
const ALLOWED_SUBSCRIPTION_STATUSES = ['ACTIVE', 'EXPIRED', 'CANCELLED'];

const createPayment = async (req, res) => {
  try {
    const { user_id, amount, status } = req.body;
    if (!user_id || amount === undefined || amount === null) {
      return res.status(400).json({
        success: false,
        message: 'user_id and amount are required'
      });
    }
    if (status && !ALLOWED_PAYMENT_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment status'
      });
    }

    const paymentId = await paymentModel.createPayment(req.body);
    const payment = await paymentModel.getPaymentById(paymentId);
    res.status(201).json({
      success: true,
      message: 'Payment recorded successfully',
      data: payment
    });
  } catch (error) {
    const statusCode = error.status || 500;
    console.error('Error creating payment:', error);
    res.status(statusCode).json({ success: false, message: error.message || 'Server error' });
  }
};

const listPayments = async (req, res) => {
  try {
    const payments = await paymentModel.getAllPayments(req.query);
    res.json({ success: true, data: payments });
  } catch (error) {
    console.error('Error listing payments:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

const getPaymentDetails = async (req, res) => {
  try {
    const payment = await paymentModel.getPaymentById(req.params.id);
    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }
    res.json({ success: true, data: payment });
  } catch (error) {
    console.error('Error fetching payment details:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

const updatePaymentStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!['PENDING', 'SUCCESS', 'FAILED'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'status must be PENDING, SUCCESS, or FAILED (use /refund for refunds)'
      });
    }

    const updated = await paymentModel.updatePaymentStatus(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }
    const payment = await paymentModel.getPaymentById(req.params.id);
    res.json({ success: true, message: `Payment updated to ${status}`, data: payment });
  } catch (error) {
    console.error('Error updating payment status:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

const refundPayment = async (req, res) => {
  try {
    const updated = await paymentModel.refundPayment(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }
    const payment = await paymentModel.getPaymentById(req.params.id);
    res.json({ success: true, message: 'Payment refunded successfully', data: payment });
  } catch (error) {
    console.error('Error refunding payment:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

const createSubscription = async (req, res) => {
  try {
    const { user_id, plan_name } = req.body;
    if (!user_id || !plan_name) {
      return res.status(400).json({
        success: false,
        message: 'user_id and plan_name are required'
      });
    }

    const subscriptionId = await paymentModel.createSubscription(req.body);
    res.status(201).json({
      success: true,
      message: 'Subscription created successfully',
      data: { id: subscriptionId }
    });
  } catch (error) {
    const statusCode = error.status || 500;
    console.error('Error creating subscription:', error);
    res.status(statusCode).json({ success: false, message: error.message || 'Server error' });
  }
};

const listSubscriptions = async (req, res) => {
  try {
    const subscriptions = await paymentModel.getAllSubscriptions(req.query);
    res.json({ success: true, data: subscriptions });
  } catch (error) {
    console.error('Error listing subscriptions:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

const updateSubscriptionStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!ALLOWED_SUBSCRIPTION_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'status must be ACTIVE, EXPIRED, or CANCELLED'
      });
    }

    const updated = await paymentModel.updateSubscriptionStatus(req.params.id, status);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Subscription not found' });
    }
    res.json({ success: true, message: `Subscription status updated to ${status}` });
  } catch (error) {
    console.error('Error updating subscription status:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

module.exports = {
  createPayment,
  listPayments,
  getPaymentDetails,
  updatePaymentStatus,
  refundPayment,
  createSubscription,
  listSubscriptions,
  updateSubscriptionStatus
};

