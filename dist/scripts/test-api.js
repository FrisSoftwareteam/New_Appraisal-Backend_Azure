"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const API_URL = 'http://localhost:8000/api';
let token;
let adminToken;
let userId;
let periodId;
let flowId;
let templateId;
let appraisalId;
const runTests = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log('Starting API Tests...');
        // 0. Check Root
        console.log('\n0. Checking Root Endpoint...');
        const rootRes = yield axios_1.default.get(`${API_URL}/`); // Note: API_URL is /api, root is /
        console.log('✅ Root Endpoint:', rootRes.data);
        // 1. Login as Admin
        console.log('\n1. Logging in as Admin...');
        const loginRes = yield axios_1.default.post(`${API_URL}/auth/login`, {
            email: 'admin@company.com',
            password: 'password123'
        });
        adminToken = loginRes.data.token;
        console.log('✅ Admin Login Successful');
        // 2. Create Appraisal Period
        console.log('\n2. Creating Appraisal Period...');
        const periodRes = yield axios_1.default.post(`${API_URL}/periods`, {
            name: 'Q1 2025 Review',
            startDate: '2025-01-01',
            endDate: '2025-03-31',
            status: 'active',
            description: 'Q1 Performance Review'
        }, { headers: { Authorization: `Bearer ${adminToken}` } });
        periodId = periodRes.data._id;
        console.log('✅ Period Created:', periodId);
        // 3. Create Appraisal Flow
        console.log('\n3. Creating Appraisal Flow...');
        const flowRes = yield axios_1.default.post(`${API_URL}/flows`, {
            name: 'Standard Flow',
            steps: [
                { name: 'Self Assessment', rank: 1, assignedRole: 'employee', isRequired: true },
                { name: 'Supervisor Review', rank: 2, assignedRole: 'supervisor', isRequired: true }
            ],
            isDefault: true
        }, { headers: { Authorization: `Bearer ${adminToken}` } });
        flowId = flowRes.data._id;
        console.log('✅ Flow Created:', flowId);
        // 4. Create Appraisal Template
        console.log('\n4. Creating Appraisal Template...');
        const templateRes = yield axios_1.default.post(`${API_URL}/templates`, {
            name: 'General Template',
            questions: [
                { text: 'Performance Rating', type: 'rating', category: 'Performance', weight: 50 },
                { text: 'Comments', type: 'text', category: 'Feedback', weight: 0 }
            ],
            applicableGrades: ['All'],
            applicableDepartments: ['All']
        }, { headers: { Authorization: `Bearer ${adminToken}` } });
        templateId = templateRes.data._id;
        console.log('✅ Template Created:', templateId);
        // 5. Login as Employee
        console.log('\n5. Logging in as Employee...');
        const empLoginRes = yield axios_1.default.post(`${API_URL}/auth/login`, {
            email: 'john.doe@company.com',
            password: 'password123'
        });
        token = empLoginRes.data.token;
        userId = empLoginRes.data.user._id;
        console.log('✅ Employee Login Successful');
        // 6. Create Appraisal (As Admin for Employee)
        console.log('\n6. Creating Appraisal Instance...');
        const appraisalRes = yield axios_1.default.post(`${API_URL}/appraisals`, {
            employeeId: userId,
            periodId,
            templateId,
            flowId
        }, { headers: { Authorization: `Bearer ${adminToken}` } });
        appraisalId = appraisalRes.data._id;
        console.log('✅ Appraisal Created:', appraisalId);
        // 7. Submit Self Review
        console.log('\n7. Submitting Self Review...');
        const stepId = flowRes.data.steps[0]._id || flowRes.data.steps[0].id; // Get ID of first step
        yield axios_1.default.post(`${API_URL}/appraisals/${appraisalId}/submit`, {
            stepId: stepId,
            responses: [
                { questionId: templateRes.data.questions[0]._id, response: 4 },
                { questionId: templateRes.data.questions[1]._id, response: 'Good quarter' }
            ],
            overallScore: 4
        }, { headers: { Authorization: `Bearer ${token}` } });
        console.log('✅ Self Review Submitted');
        // 8. Check Dashboard Stats
        console.log('\n8. Checking Dashboard Stats...');
        const statsRes = yield axios_1.default.get(`${API_URL}/dashboard/stats`, {
            headers: { Authorization: `Bearer ${adminToken}` }
        });
        console.log('✅ Dashboard Stats:', statsRes.data);
        console.log('\n🎉 All Tests Passed!');
    }
    catch (error) {
        console.error('❌ Test Failed:', error);
        if (error.response) {
            console.error('Response Data:', error.response.data);
            console.error('Response Status:', error.response.status);
        }
    }
});
runTests();
