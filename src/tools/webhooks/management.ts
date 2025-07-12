import { GitHubConfig, ToolResponse } from '../../shared/types.js';
import { WebhookService } from '../../services/webhook-service.js';
import { SupportedWebhookEvent } from '../../shared/webhook-types.js';

/**
 * Setup GitHub webhooks for real-time updates
 */
export async function setupWebhooks(config: GitHubConfig, args: {
  webhook_url: string;
  events?: SupportedWebhookEvent[];
  secret?: string;
  active?: boolean;
}): Promise<ToolResponse> {
  const webhookService = new WebhookService(config);
  return await webhookService.setupWebhook(args);
}

/**
 * List all configured webhooks for the repository
 */
export async function listWebhooks(config: GitHubConfig, args: {}): Promise<ToolResponse> {
  const webhookService = new WebhookService(config);
  return await webhookService.listWebhooks();
}

/**
 * Test webhook connectivity and functionality
 */
export async function testWebhook(config: GitHubConfig, args: {
  webhook_id?: number;
}): Promise<ToolResponse> {
  const webhookService = new WebhookService(config);
  return await webhookService.testWebhook(args);
}

/**
 * Remove webhook(s) from repository
 */
export async function removeWebhooks(config: GitHubConfig, args: {
  webhook_id?: number;
  confirm?: boolean;
}): Promise<ToolResponse> {
  const webhookService = new WebhookService(config);
  return await webhookService.removeWebhooks(args);
}

/**
 * Get webhook delivery history and status
 */
export async function getWebhookDeliveries(config: GitHubConfig, args: {
  webhook_id: number;
  per_page?: number;
}): Promise<ToolResponse> {
  try {
    const perPage = Math.min(args.per_page || 30, 100);
    
    const response = await config.octokit.rest.repos.listWebhookDeliveries({
      owner: config.owner,
      repo: config.repo,
      hook_id: args.webhook_id,
      per_page: perPage
    });

    const deliveries = response.data;

    let result = `📦 **Webhook Deliveries** (Webhook ID: ${args.webhook_id})\n\n`;
    result += `Found ${deliveries.length} recent deliveries\n\n`;

    if (deliveries.length === 0) {
      result += "No deliveries found for this webhook.\n\n";
      result += "💡 This could mean:\n";
      result += "• Webhook was recently created\n";
      result += "• No events have triggered the webhook\n";
      result += "• Delivery history has expired (GitHub keeps ~7 days)";
    } else {
      deliveries.forEach((delivery, index) => {
        const status = delivery.status_code >= 200 && delivery.status_code < 300 ? '✅' : '❌';
        const deliveredAt = new Date(delivery.delivered_at).toLocaleString();
        
        result += `### Delivery #${index + 1}\n`;
        result += `**Status:** ${status} ${delivery.status_code} (${delivery.status})\n`;
        result += `**Event:** ${delivery.event}`;
        if (delivery.action) {
          result += ` (${delivery.action})`;
        }
        result += `\n`;
        result += `**Delivered:** ${deliveredAt}\n`;
        result += `**Duration:** ${delivery.duration}ms\n`;
        result += `**GUID:** ${delivery.guid}\n`;
        if (delivery.redelivery) {
          result += `**Redelivery:** ⚠️ Yes\n`;
        }
        result += `\n`;
      });

      // Summary statistics
      const successfulDeliveries = deliveries.filter(d => d.status_code >= 200 && d.status_code < 300).length;
      const failedDeliveries = deliveries.length - successfulDeliveries;
      const avgDuration = Math.round(deliveries.reduce((sum, d) => sum + d.duration, 0) / deliveries.length);
      
      result += `📊 **Summary:**\n`;
      result += `• Successful: ${successfulDeliveries}/${deliveries.length} (${Math.round((successfulDeliveries / deliveries.length) * 100)}%)\n`;
      result += `• Failed: ${failedDeliveries}\n`;
      result += `• Average response time: ${avgDuration}ms\n`;
      
      if (failedDeliveries > 0) {
        result += `\n⚠️ **Troubleshooting Failed Deliveries:**\n`;
        result += `• Check webhook endpoint availability\n`;
        result += `• Verify SSL certificate if using HTTPS\n`;
        result += `• Review webhook secret configuration\n`;
        result += `• Use 'test_webhook' to verify connectivity`;
      }
    }

    return {
      content: [{ type: "text", text: result }]
    };
  } catch (error: any) {
    if (error.status === 404) {
      return {
        content: [{
          type: "text",
          text: `❌ **Webhook not found**\n\nWebhook ID ${args.webhook_id} does not exist. Use 'list_webhooks' to see available webhooks.`
        }]
      };
    }
    throw new Error(`Failed to get webhook deliveries: ${error.message}`);
  }
}

/**
 * Get webhook configuration and health status
 */
export async function getWebhookStatus(config: GitHubConfig, args: {
  webhook_id?: number;
}): Promise<ToolResponse> {
  try {
    // Get all webhooks if no specific ID provided
    const webhooksResponse = await config.octokit.rest.repos.listWebhooks({
      owner: config.owner,
      repo: config.repo
    });

    const webhooks = webhooksResponse.data;
    
    if (webhooks.length === 0) {
      return {
        content: [{
          type: "text",
          text: `📊 **Webhook Status**\n\n❌ **No webhooks configured**\n\nNo webhooks are set up for this repository. Use 'setup_webhooks' to enable real-time updates.`
        }]
      };
    }

    let result = `📊 **Webhook Status Report**\n\n`;
    result += `**Repository:** ${config.owner}/${config.repo}\n`;
    result += `**Generated:** ${new Date().toLocaleString()}\n\n`;

    const targetWebhooks = args.webhook_id 
      ? webhooks.filter(w => w.id === args.webhook_id)
      : webhooks;

    if (args.webhook_id && targetWebhooks.length === 0) {
      return {
        content: [{
          type: "text",
          text: `❌ **Webhook not found**\n\nWebhook ID ${args.webhook_id} does not exist.`
        }]
      };
    }

    for (const webhook of targetWebhooks) {
      result += `### Webhook #${webhook.id}\n`;
      result += `**URL:** ${webhook.config.url}\n`;
      result += `**Status:** ${webhook.active ? '✅ Active' : '❌ Inactive'}\n`;
      result += `**Events:** ${webhook.events.join(', ')}\n`;
      result += `**Content Type:** ${webhook.config.content_type}\n`;
      result += `**SSL Verification:** ${webhook.config.insecure_ssl === '0' ? '✅ Enabled' : '⚠️ Disabled'}\n`;
      result += `**Secret Configured:** ${webhook.config.secret ? '✅ Yes' : '❌ No'}\n`;
      result += `**Created:** ${new Date(webhook.created_at).toLocaleString()}\n`;
      result += `**Last Updated:** ${new Date(webhook.updated_at).toLocaleString()}\n`;

      if (webhook.last_response) {
        const lastResponse = webhook.last_response;
        const statusIcon = lastResponse.code >= 200 && lastResponse.code < 300 ? '✅' : '❌';
        result += `**Last Response:** ${statusIcon} ${lastResponse.code} - ${lastResponse.status}\n`;
        if (lastResponse.message) {
          result += `**Last Message:** ${lastResponse.message}\n`;
        }
      } else {
        result += `**Last Response:** No deliveries yet\n`;
      }

      result += `\n**Management URLs:**\n`;
      result += `• Test: ${webhook.test_url}\n`;
      result += `• Ping: ${webhook.ping_url}\n`;
      
      result += `\n`;
    }

    // Overall health summary
    const activeWebhooks = webhooks.filter(w => w.active).length;
    const totalWebhooks = webhooks.length;
    
    result += `🏥 **Health Summary:**\n`;
    result += `• **Active Webhooks:** ${activeWebhooks}/${totalWebhooks}\n`;
    
    if (activeWebhooks === 0) {
      result += `• **Status:** ❌ No active webhooks - real-time updates disabled\n`;
      result += `• **Recommendation:** Enable existing webhooks or create new ones\n`;
    } else if (activeWebhooks === totalWebhooks) {
      result += `• **Status:** ✅ All webhooks active - real-time updates enabled\n`;
      result += `• **Recommendation:** Monitor delivery success rates\n`;
    } else {
      result += `• **Status:** ⚠️ Partial webhook coverage\n`;
      result += `• **Recommendation:** Review and activate inactive webhooks\n`;
    }

    const secretsConfigured = webhooks.filter(w => w.config.secret).length;
    result += `• **Security:** ${secretsConfigured}/${totalWebhooks} webhooks have secrets configured\n`;
    
    if (secretsConfigured < totalWebhooks) {
      result += `• **Security Warning:** Some webhooks lack secret validation\n`;
    }

    return {
      content: [{ type: "text", text: result }]
    };
  } catch (error: any) {
    throw new Error(`Failed to get webhook status: ${error.message}`);
  }
}
