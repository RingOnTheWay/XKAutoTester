const axios = require('axios');
const crypto = require('crypto');

class NotificationService {
  constructor(i18nService) {
    this.i18nService = i18nService;
  }

  async sendDingTalkNotification(notificationData) {
    try {
      const { accessToken, secret, message } = notificationData;
      
      if (!accessToken || !secret) {
        return { success: false, error: '钉钉配置不完整，请检查 access_token 和 secret' };
      }
      
      const timestamp = Date.now().toString();
      const stringToSign = `${timestamp}\n${secret}`;
      
      const hmac = crypto.createHmac('sha256', secret);
      hmac.update(stringToSign);
      const hmacCode = hmac.digest();
      const sign = encodeURIComponent(hmacCode.toString('base64'));
      
      const url = `https://oapi.dingtalk.com/robot/send?access_token=${accessToken}&timestamp=${timestamp}&sign=${sign}`;
      
      const body = {
        at: {
          isAtAll: 'false',
          atUserIds: [],
          atMobiles: []
        },
        text: {
          content: message
        },
        msgtype: 'text'
      };
      
      const response = await axios.post(url, body, {
        headers: {
          'Content-Type': 'application/json'
        }
      });
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = NotificationService;
