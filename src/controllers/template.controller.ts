import { Request, Response } from 'express';
import AppraisalTemplate from '../models/AppraisalTemplate';
import User from '../models/User';
import Appraisal from '../models/Appraisal';
import AppraisalPeriod from '../models/AppraisalPeriod';
import AppraisalFlow from '../models/AppraisalFlow';
import { AuthRequest } from '../middleware/auth.middleware';

// Create a new template
export const createTemplate = async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, questions, applicableGrades, applicableDepartments, assignedUsers, status } = req.body;

    // Validate assigned users if provided
    if (assignedUsers && assignedUsers.length > 0) {
      const users = await User.find({ _id: { $in: assignedUsers } });
      if (users.length !== assignedUsers.length) {
        return res.status(400).json({ message: 'One or more assigned users not found' });
      }
    }

    const template = new AppraisalTemplate({
      name,
      description,
      questions,
      applicableGrades,
      applicableDepartments,
      assignedUsers,
      status: status || 'draft',
      createdBy: req.user?._id,
    });

    await template.save();
    res.status(201).json(template);
  } catch (error) {
    res.status(500).json({ message: 'Error creating template', error });
  }
};

// Get all templates
export const getAllTemplates = async (req: Request, res: Response) => {
  try {
    const templates = await AppraisalTemplate.find()
      .populate('createdBy', 'firstName lastName')
      .populate('assignedUsers', 'firstName lastName email')
      .sort({ createdAt: -1 });
    res.json(templates);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching templates', error });
  }
};

// Get single template
export const getTemplateById = async (req: Request, res: Response) => {
  try {
    const template = await AppraisalTemplate.findById(req.params.id)
      .populate('createdBy', 'firstName lastName')
      .populate('assignedUsers', 'firstName lastName email');
    
    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }
    res.json(template);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching template', error });
  }
};

// Update template
export const updateTemplate = async (req: Request, res: Response) => {
  try {
    const { name, description, questions, applicableGrades, applicableDepartments, assignedUsers, status } = req.body;

    // Validate assigned users if provided
    if (assignedUsers && assignedUsers.length > 0) {
      const users = await User.find({ _id: { $in: assignedUsers } });
      if (users.length !== assignedUsers.length) {
        return res.status(400).json({ message: 'One or more assigned users not found' });
      }
    }

    const template = await AppraisalTemplate.findByIdAndUpdate(
      req.params.id,
      {
        name,
        description,
        questions,
        applicableGrades,
        applicableDepartments,
        assignedUsers,
        status,
      },
      { new: true }
    ).populate('assignedUsers', 'firstName lastName email');

    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }

    res.json(template);
  } catch (error) {
    res.status(500).json({ message: 'Error updating template', error });
  }
};

// Delete template
export const deleteTemplate = async (req: Request, res: Response) => {
  try {
    const template = await AppraisalTemplate.findByIdAndDelete(req.params.id);
    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }
    res.json({ message: 'Template deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting template', error });
  }
};

export const deleteAllTemplates = async (req: Request, res: Response) => {
  try {
    const result = await AppraisalTemplate.deleteMany({});
    res.status(200).json({ 
      message: 'All templates deleted successfully', 
      deletedCount: result.deletedCount 
    });
  } catch (error) {
    console.error('Error deleting all templates:', error);
    res.status(500).json({ message: 'Error deleting all templates' });
  }
};

// Assign template to users (convenience endpoint)
export const assignTemplate = async (req: Request, res: Response) => {
  try {
    const { userIds } = req.body;
    
    if (!userIds || !Array.isArray(userIds)) {
      return res.status(400).json({ message: 'userIds array is required' });
    }

    const template = await AppraisalTemplate.findByIdAndUpdate(
      req.params.id,
      { $addToSet: { assignedUsers: { $each: userIds } } },
      { new: true }
    ).populate('assignedUsers', 'firstName lastName email');

    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }

    res.json(template);
  } catch (error) {
    res.status(500).json({ message: 'Error assigning template', error });
  }
};

// Approve template (HR Admin only)
export const approveTemplate = async (req: AuthRequest, res: Response) => {
  try {
    console.log('Approve Template called for ID:', req.params.id);
    const template = await AppraisalTemplate.findByIdAndUpdate(
      req.params.id,
      { status: 'active' },
      { new: true }
    );

    if (!template) {
      console.log('Template not found');
      return res.status(404).json({ message: 'Template not found' });
    }
    console.log('Template approved:', template.name);

    // Return the template object with an added message field
    const responseObj = {
      ...template.toJSON(),
      message: `Template approved successfully. You can now initiate appraisals.`
    };
    
    res.json(responseObj);
  } catch (error) {
    console.error('Error approving template:', error);
    res.status(500).json({ message: 'Error approving template', error });
  }
};

// Reject template (HR Admin only)
export const rejectTemplate = async (req: AuthRequest, res: Response) => {
  try {
    console.log('Reject Template called for ID:', req.params.id);
    const template = await AppraisalTemplate.findByIdAndUpdate(
      req.params.id,
      { status: 'rejected' },
      { new: true }
    );

    if (!template) {
      console.log('Template not found');
      return res.status(404).json({ message: 'Template not found' });
    }
    console.log('Template rejected:', template.name);

    res.json({
      ...template.toJSON(),
      message: 'Template rejected successfully'
    });
  } catch (error) {
    console.error('Error rejecting template:', error);
    res.status(500).json({ message: 'Error rejecting template', error });
  }
};

// Get eligible staff for a template
export const getEligibleStaffForTemplate = async (req: Request, res: Response) => {
  try {
    const template = await AppraisalTemplate.findById(req.params.id);
    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }

    const query: any = { role: 'employee' }; // Base query

    // If explicit users assigned, they are eligible
    if (template.assignedUsers && template.assignedUsers.length > 0) {
      query._id = { $in: template.assignedUsers };
    } else {
      // Otherwise check departments and grades
      const conditions: any[] = [];
      
      if (template.applicableDepartments && template.applicableDepartments.length > 0) {
        conditions.push({ department: { $in: template.applicableDepartments } });
      }
      
      if (template.applicableGrades && template.applicableGrades.length > 0) {
        conditions.push({ grade: { $in: template.applicableGrades } });
      }

      if (conditions.length > 0) {
        query.$or = conditions;
      }
    }

    const staff = await User.find(query).select('firstName lastName email department grade jobTitle');
    res.json(staff);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching eligible staff', error });
  }
};
