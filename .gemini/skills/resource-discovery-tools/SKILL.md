---
name: resource-discovery-tools
description: Provides tools for resource discovery, including checking existing resources, adding new ones, fetching web pages, and managing a discovery queue.
---

# Resource Discovery Tools Skill

This skill provides a set of tools designed for automated resource discovery and management within the Gemini CLI environment.

## Tools Provided:

*   **fetch_page**: Fetches and reads content from a specified web page.
*   **check_existing**: Checks if a URL already exists in the resources database or discovery queue.
*   **add_resource**: Adds a verified free resource to the database.
*   **check_social**: Checks social media for discussions about a resource.
*   **check_references**: Searches for pages that link to or mention a specific URL.
*   **queue_items**: Queues multiple URLs for later processing in the discovery queue.
*   **get_queue**: Retrieves the next batch of pending URLs from the discovery queue.

## Usage:

These tools are designed to be used by the Gemini agent to automate the process of finding, verifying, and adding new resources. The agent will automatically select and use the appropriate tool based on the current task.

For example, to check if a resource already exists before adding it, the agent will call `check_existing`. To add a new resource, it will call `add_resource`.
