// import axios from 'axios';
// import dotenv from 'dotenv';
var axios = require('axios');
var dotenv = require('dotenv');

dotenv.config();

const CONSUMER_KEY = process.env.CONSUMER_KEY;
let SESSION_TOKEN = '';
const AUTH_TOKEN = process.env.AUTH_TOKEN;
const LOSS_LIMIT = process.env.LOSS_LIMIT;
let shouldWait = false;

const getLossForEachTrade = (data) => {
    return data.map(item => ((item.averageStockPrice - item.lastPrice) * item.netTrdQtyLot) * -1);
}

const getSumLossForEachTrade = (lossForEachTrade) => {
   return lossForEachTrade.reduce((acc,curr) => acc+curr, 0);
}

const checkLossLimit = (sumValue, orders) => {
  console.log(`Loss limit is ${LOSS_LIMIT} , sumValue is ${sumValue}`);
  if(sumValue <= LOSS_LIMIT) {
      /* square off positions if limit is reached */
    shouldWait = true;
    sendMsg('squaring off positions');
    squareOffPositions(orders)
  }
}

const sendMsg = (msg) => {
    const url = `https://api.telegram.org/bot${process.env.TELE_BOT_TOKEN}/sendMessage?chat_id=${process.env.TELE_CHAT_ID}&text=${msg}`;
    // console.log('url',url);
   axios({url: url})
}

const breakQuantityAndPlaceOrder = (order) => {
    let quantity = Math.abs(order.netTrdQtyLot);
    let maxLimit = 900;

    while( quantity != 0) {
        if(quantity > maxLimit) {
            placeOrderWithDelay(order,900,250);
            quantity = Math.abs(order.netTrdQtyLot) - 900
          } else {
            placeOrderWithDelay(order,quantity,250);
            quantity = 0;
            shouldWait = false;
            console.log('quantity is now 0');
        }
    }
}

const placeOrderWithDelay = (order, quantity, delay) => {
    setTimeout(() => {
        placeOrder(order, quantity);
    },delay)
}

const placeOrder = (order, quantity) => {
   const data = JSON.stringify({
    "instrumentToken": order.instrumentToken,
    "transactionType": "BUY",
    "quantity": quantity,
    "price": 0,
    "validity": "GFD",
    "variety": "REGULAR",
    "disclosedQuantity": 0,
    "triggerPrice": 0,
    "tag": "string"
  });

  const config = {
    method: 'post',
    url: 'https://ctradeapi.kotaksecurities.com/apim/orders/1.0/order/normal',
    headers: {
      'consumerKey': CONSUMER_KEY,
      'sessionToken': SESSION_TOKEN,
      'Content-Type': 'application/json',
      'Authorization': AUTH_TOKEN
    },
    data : data
  };

  console.log('placing order');

  axios(config).then(function (response) {
    sendMsg('Order placed Successfully');
  }).catch(function (error) {
    console.log(error);
  }
  )
}

const squareOffPositions = (orders) => {
   orders.forEach(order => {
    breakQuantityAndPlaceOrder(order)
   })
}

const getPositions = () => {
    const config = {
        method: 'get',
        url: 'https://ctradeapi.kotaksecurities.com/apim/positions/1.0/positions/open',
        headers: {
          'consumerKey': CONSUMER_KEY,
          'sessionToken': SESSION_TOKEN,
          'Authorization': AUTH_TOKEN
        }
    };

    console.log('getting positions');

    axios(config).then(function (response) {
       const responseData = response.data['Success'];
       console.log('got postions');
       const maxQuantityNonZero = responseData.filter(item => item.netTrdQtyLot !=0);
       const lossForEachTrade = getLossForEachTrade(maxQuantityNonZero);
       const sumLossForEachTrade = getSumLossForEachTrade(lossForEachTrade);
       checkLossLimit(sumLossForEachTrade,maxQuantityNonZero);
    }).catch(function (error) {
       console.log(error);
       shouldWait = false;
    });
}

const init = async () => {

   const today = new Date();

   if( !SESSION_TOKEN || !TOKEN_GENERATED_TIMESTAMP || TOKEN_GENERATED_TIMESTAMP.toDateString() !== today.toDateString()) {
     let loginResponse = await login();
     const ott = loginResponse.Success.oneTimeToken;
     let sessionTokenResponse = await getSessionToken(ott);
     SESSION_TOKEN = sessionTokenResponse && sessionTokenResponse.success.sessionToken;
     console.log('session token generated');
   }

   if(!shouldWait && SESSION_TOKEN) {
    getPositionInIntervals(5000);
   }
};

const getPositionInIntervals = (delay) => {
    setInterval(async () => {
        await getPositions();
    }, delay)
}

const getSessionToken = (ott) => {
    var data = JSON.stringify({
        "userid": process.env.USER_ID
      });

      var config = {
        method: 'post',
        url: 'https://ctradeapi.kotaksecurities.com/apim/session/1.0/session/2FA/oneTimeToken',
        headers: {
          'oneTimeToken': ott,
          'appId': process.env.APP_ID,
          'consumerKey': process.env.CONSUMER_KEY,
          'ip': process.env.IP,
          'Content-Type': 'application/json',
          'Authorization': AUTH_TOKEN
        },
        data : data
      };

      return axios(config).then(function (response) {
        return response.data;
      }).catch(function (error) {
        console.log(error);
        shouldWait = false;
      });
}

const login = () => {
    var data = JSON.stringify({
        "userid": process.env.USER_ID,
        "password": process.env.PSWD
      });

      var config = {
        method: 'post',
        url: 'https://ctradeapi.kotaksecurities.com/apim/session/1.0/session/login/userid',
        headers: {
          'consumerKey': CONSUMER_KEY,
          'ip': process.env.IP,
          'appId': 'DefaultApplication',
          'Content-Type': 'application/json',
          'Authorization': AUTH_TOKEN
        },
        data : data
      };

      return axios(config).then(function (response) {
        return response.data
      }).catch(function (error) {
        console.log(error);
      });
}

init();
