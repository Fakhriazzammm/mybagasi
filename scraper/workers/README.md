"""
Hermes Browser Worker — Cron Prompt

This is the prompt that should be used when creating the Hermes cron job.
The worker script polls Supabase and prints pending jobs, then the Hermes
agent processes them using its browser tools.

To set up the cron job:

    hermes cron create --name "bagasi-browser" \
        --script /opt/mybagasi/scraper/workers/hermes_poll.py \
        "5m" \
        "You are the Bagasi AI browser worker. The script output shows pending scrape jobs from Supabase. For each job: 1) Use your browser tools to navigate to the URL 2) Extract product data from the page (title, price in JPY, condition, product images URLs, description, seller name) 3) POST the result to http://127.0.0.1:8000/scrape-process with JSON body: {\"job_id\": \"<id>\", \"result\": {\"title\": \"...\", \"price_display\": \"...\", \"price_jpy\": 1234, \"condition\": \"...\", \"images\": [\"url1\"], \"description\": \"...\", \"seller\": \"...\", \"marketplace\": \"...\", \"available\": true, \"confidence\": \"medium\"}}. If the page is blocked or not a product, POST with error field instead. Use httpx or curl to POST results. Process each job one at a time."

Alternative: For a webhook-based approach instead of cron, enable the Hermes webhook platform:

    In ~/.hermes/config.yaml add:
      platforms:
        webhook:
          enabled: true
          extra:
            host: "0.0.0.0"
            port: 8644
            secret: "<your-secret>"

    Then POST to http://localhost:8644/webhook/<route> to trigger scraping.
"""
