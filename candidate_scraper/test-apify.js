import 'dotenv/config';
import { ApifyClient } from 'apify-client';

async function testApify() {
  console.log('Testing Apify configuration...');
  console.log('APIFY_TOKEN:', process.env.APIFY_TOKEN ? 'SET' : 'NOT SET');
  console.log('APIFY_ACTOR_ID:', process.env.APIFY_ACTOR_ID || 'NOT SET');
  console.log('APIFY_TASK_ID:', process.env.APIFY_TASK_ID || 'NOT SET');

  if (!process.env.APIFY_TOKEN) {
    console.error('❌ APIFY_TOKEN is missing!');
    return;
  }

  try {
    const client = new ApifyClient({ token: process.env.APIFY_TOKEN });
    console.log('✓ ApifyClient created successfully');

    const input = {
      query: 'Software Engineer',
      location: 'United States',
      maxItems: 5,
      sources: ['permitted-public-web']
    };

    console.log('\nAttempting to call Apify...');
    console.log('Input:', JSON.stringify(input, null, 2));

    const run = process.env.APIFY_TASK_ID
      ? await client.task(process.env.APIFY_TASK_ID).call(input)
      : await client.actor(process.env.APIFY_ACTOR_ID).call(input);

    console.log('✓ Apify call successful!');
    console.log('Run ID:', run.id);
    console.log('Default Dataset ID:', run.defaultDatasetId);

    const { items } = await client.dataset(run.defaultDatasetId).listItems({
      limit: 5,
      clean: true
    });

    console.log(`✓ Retrieved ${items.length} items`);
    console.log('Sample item:', JSON.stringify(items[0], null, 2));

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

testApify();
