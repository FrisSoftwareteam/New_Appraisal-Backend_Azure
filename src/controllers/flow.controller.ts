import { Request, Response } from 'express';
import AppraisalFlow from '../models/AppraisalFlow';
import { AuthRequest } from '../middleware/auth.middleware';

export const createFlow = async (req: AuthRequest, res: Response) => {
  try {
    const flow = new AppraisalFlow({
      ...req.body,
      createdBy: req.user?._id,
    });
    await flow.save();
    res.status(201).send(flow);
  } catch (error) {
    res.status(400).send(error);
  }
};

export const getFlows = async (req: Request, res: Response) => {
  try {
    const flows = await AppraisalFlow.find({});
    res.send(flows);
  } catch (error) {
    res.status(500).send(error);
  }
};

export const getFlowById = async (req: Request, res: Response) => {
  try {
    const flow = await AppraisalFlow.findById(req.params.id);
    if (!flow) {
      return res.status(404).send();
    }
    res.send(flow);
  } catch (error) {
    res.status(500).send(error);
  }
};

export const updateFlow = async (req: Request, res: Response) => {
  try {
    const flow = await AppraisalFlow.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!flow) {
      return res.status(404).send();
    }
    res.send(flow);
  } catch (error) {
    res.status(400).send(error);
  }
};

export const deleteFlow = async (req: Request, res: Response) => {
  try {
    const flow = await AppraisalFlow.findByIdAndDelete(req.params.id);
    if (!flow) {
      return res.status(404).send();
    }
    res.send(flow);
  } catch (error) {
    res.status(500).send(error);
  }
};
