import axios from 'axios';

const testAPI = async () => {
  try {
    // First, get the employee user to simulate login
    const loginResponse = await axios.post('http://localhost:8001/api/auth/debug-login', {
      role: 'employee'
    });
    
    const token = (loginResponse.data as any).token;
    console.log('Logged in as employee, token:', token.substring(0, 20) + '...');
    
    // Now fetch my appraisals
    const appraisalsResponse = await axios.get('http://localhost:8001/api/appraisals/my-appraisals', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    const data = appraisalsResponse.data as any[];
    console.log('\nMy Appraisals Response:');
    console.log('Count:', data.length);
    
    if (data.length > 0) {
      console.log('\nFirst Appraisal:');
      const appraisal = data[0];
      console.log('  ID:', appraisal._id);
      console.log('  Employee:', appraisal.employee?.firstName, appraisal.employee?.lastName);
      console.log('  Template:', appraisal.template?.name);
      console.log('  Workflow:', appraisal.workflow?.name);
      console.log('  Period:', appraisal.period);
      console.log('  Status:', appraisal.status);
      console.log('  Current Step:', appraisal.currentStep);
    } else {
      console.log('No appraisals found!');
    }
    
  } catch (error: any) {
    console.error('Test failed:');
    if (error.response) {
      console.error('  Status:', error.response.status);
      console.error('  Data:', error.response.data);
    } else if (error.request) {
      console.error('  No response received');
      console.error('  Request:', error.request);
    } else {
      console.error('  Error:', error.message);
    }
  }
};

testAPI();
