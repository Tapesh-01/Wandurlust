require('dotenv').config();
const apiKey = process.env.GEMINI_API_KEY;

async function list() {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const res = await fetch(url);
    const data = await res.json();
    const geminis = data.models.filter(m => m.name.includes('gemini'));
    console.log(JSON.stringify(geminis, null, 2));
}
list();
