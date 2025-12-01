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

    // Auto-create appraisals for eligible staff
    // 1. Get Active Period
    console.log('Finding active period...');
    let period = await AppraisalPeriod.findOne({ status: 'active' });
    if (!period) {
      console.log('No active period found, checking for any period...');
      // Fallback: Find any period or create default
      period = await AppraisalPeriod.findOne().sort({ createdAt: -1 });
      if (!period) {
        console.log('No periods exist, creating default...');
        period = await AppraisalPeriod.create({
          name: `Period ${new Date().getFullYear()}`,
          startDate: new Date(),
          endDate: new Date(new Date().setMonth(new Date().getMonth() + 1)),
          status: 'active',
          createdBy: req.user?._id
        });
      }
    }
    console.log('Using period:', period.name);

    // 2. Get Default Workflow
    console.log('Finding default workflow...');
    let workflow = await AppraisalFlow.findOne({ isDefault: true });
    if (!workflow) {
      console.log('No default workflow, checking for any...');
      workflow = await AppraisalFlow.findOne();
      if (!workflow) {
        console.log('No workflows exist, creating default...');
        // Create a default workflow if none exists
        workflow = await AppraisalFlow.create({
          name: 'Standard Appraisal Flow',
          isDefault: true,
          createdBy: req.user?._id,
          steps: [
            { name: 'Self Appraisal', rank: 1, assignedRole: 'employee', isRequired: true, dueInDays: 7 },
            { name: 'Manager Review', rank: 2, assignedRole: 'supervisor', isRequired: true, dueInDays: 7 }
          ]
        });
      }
    }
    console.log('Using workflow:', workflow.name);

    // 3. Get Eligible Staff (Reuse logic)
    console.log('Finding eligible staff...');
    const query: any = { role: 'employee' };
    if (template.assignedUsers && template.assignedUsers.length > 0) {
      console.log('Using explicit assigned users:', template.assignedUsers.length);
      query._id = { $in: template.assignedUsers };
    } else {
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
      console.log('Using conditions:', JSON.stringify(conditions));
    }
    
    const staffList = await User.find(query);
    console.log(`Found ${staffList.length} eligible staff members`);
    
    // 4. Create Appraisals
    let createdCount = 0;
    for (const employee of staffList) {
      // Check if exists
      const exists = await Appraisal.findOne({
        employee: employee._id,
        template: template._id,
        period: period.name // Using name as period string in Appraisal model
      });

      if (!exists) {
        console.log(`Creating appraisal for ${employee.firstName} ${employee.lastName}`);
        
        // Resolve step assignments
        const stepAssignments = workflow.steps.map((step: any) => {
          let assignedUser = null;
          
          if (step.assignedRole === 'employee') {
            assignedUser = employee._id;
          } else if (step.assignedRole === 'supervisor') {
            assignedUser = employee.supervisor;
          }
          // Add other role resolutions here (e.g. HOD) if available in User model
          
          return {
            stepId: step._id || step.id, // Ensure we capture the step ID
            assignedUser: assignedUser,
            status: 'pending'
          };
        });

        await Appraisal.create({
          employee: employee._id,
          template: template._id,
          workflow: workflow._id,
          period: period.name,
          status: 'setup',
          currentStep: 0,
          stepAssignments,
          reviews: [], // Initialize empty reviews
          history: [{
            action: 'initiated',
            actor: req.user?._id,
            timestamp: new Date(),
            comment: 'Auto-initiated upon template approval'
          }]
        });
        createdCount++;
      } else {
        console.log(`Appraisal already exists for ${employee.firstName} ${employee.lastName}`);
      }
    }

    console.log(`Total appraisals created: ${createdCount}`);
    
    // Return the template object with an added message field
    // Use toJSON() to ensure populated fields are preserved
    const responseObj = {
      ...template.toJSON(),
      message: `Template approved and ${createdCount} appraisals initiated`
    };
    
    res.json(responseObj);
  } catch (error) {
    console.error('Error approving template:', error);
    res.status(500).json({ message: 'Error approving template', error });
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
