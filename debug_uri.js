require('dotenv').config(); const uri = process.env.MONGODB_URI || ''; try { console.log('Hostname:', uri.split('@')[1].split('/')[0]); } catch(e) { console.log('Could not parse URI'); }
