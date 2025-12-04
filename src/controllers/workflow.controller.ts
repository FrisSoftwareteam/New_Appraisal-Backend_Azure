import { Request, Response } from 'express';
import AppraisalFlow from '../models/AppraisalFlow';

// Create a new workflow
export const createWorkflow = async (req: Request, res: Response) => {
  try {
    const { name, description, steps, isDefault } = req.body;
    
    // If this is set as default, unset others
    if (isDefault) {
      await AppraisalFlow.updateMany({}, { isDefault: false });
    }
    
    const workflow = new AppraisalFlow({
      name,
      description,
      steps,
      isDefault,
      createdBy: (req as any).user.id
    });
    
    await workflow.save();
    res.status(201).json(workflow);
  } catch (error) {
    console.error('Error creating workflow:', error);
    res.status(500).json({ message: 'Error creating workflow' });
  }
};

// Get all workflows
export const getAllWorkflows = async (req: Request, res: Response) => {
  try {
    const workflows = await AppraisalFlow.find().sort({ createdAt: -1 });
    res.status(200).json(workflows);
  } catch (error) {
    console.error('Error fetching workflows:', error);
    res.status(500).json({ message: 'Error fetching workflows' });
  }
};

// Get single workflow
export const getWorkflowById = async (req: Request, res: Response) => {
  try {
    const workflow = await AppraisalFlow.findById(req.params.id);
    if (!workflow) {
      return res.status(404).json({ message: 'Workflow not found' });
    }
    res.status(200).json(workflow);
  } catch (error) {
    console.error('Error fetching workflow:', error);
    res.status(500).json({ message: 'Error fetching workflow' });
  }
};

// Update workflow
export const updateWorkflow = async (req: Request, res: Response) => {
  try {
    const { name, description, steps, isDefault } = req.body;
    
    // If setting as default, unset others
    if (isDefault) {
      await AppraisalFlow.updateMany({ _id: { $ne: req.params.id } }, { isDefault: false });
    }
    
    const workflow = await AppraisalFlow.findByIdAndUpdate(
      req.params.id,
      { name, description, steps, isDefault },
      { new: true, runValidators: true }
    );
    
    if (!workflow) {
      return res.status(404).json({ message: 'Workflow not found' });
    }
    
    res.status(200).json(workflow);
  } catch (error) {
    console.error('Error updating workflow:', error);
    res.status(500).json({ message: 'Error updating workflow' });
  }
};

// Delete workflow
export const deleteWorkflow = async (req: Request, res: Response) => {
  try {
    const workflow = await AppraisalFlow.findByIdAndDelete(req.params.id);
    if (!workflow) {
      return res.status(404).json({ message: 'Workflow not found' });
    }
    res.status(200).json({ message: 'Workflow deleted successfully' });
  } catch (error) {
    console.error('Error deleting workflow:', error);
    res.status(500).json({ message: 'Error deleting workflow' });
  }
};

export const deleteAllWorkflows = async (req: Request, res: Response) => {
  try {
    const result = await AppraisalFlow.deleteMany({});
    res.status(200).json({ 
      message: 'All workflows deleted successfully', 
      deletedCount: result.deletedCount 
    });
  } catch (error) {
    console.error('Error deleting all workflows:', error);
    res.status(500).json({ message: 'Error deleting all workflows' });
  }
};

// Duplicate workflow
export const duplicateWorkflow = async (req: Request, res: Response) => {
  try {
    const originalWorkflow = await AppraisalFlow.findById(req.params.id);
    if (!originalWorkflow) {
      return res.status(404).json({ message: 'Workflow not found' });
    }
    
    const newWorkflow = new AppraisalFlow({
      name: `${originalWorkflow.name} (Copy)`,
      description: originalWorkflow.description,
      steps: originalWorkflow.steps,
      isDefault: false, // Copies shouldn't be default automatically
      createdBy: (req as any).user.id
    });
    
    await newWorkflow.save();
    res.status(201).json(newWorkflow);
  } catch (error) {
    console.error('Error duplicating workflow:', error);
    res.status(500).json({ message: 'Error duplicating workflow' });
  }
};

// Set default workflow
export const setDefaultWorkflow = async (req: Request, res: Response) => {
  try {
    await AppraisalFlow.updateMany({}, { isDefault: false });
    
    const workflow = await AppraisalFlow.findByIdAndUpdate(
      req.params.id,
      { isDefault: true },
      { new: true }
    );
    
    if (!workflow) {
      return res.status(404).json({ message: 'Workflow not found' });
    }
    
    res.status(200).json(workflow);
  } catch (error) {
    console.error('Error setting default workflow:', error);
    res.status(500).json({ message: 'Error setting default workflow' });
  }
};
