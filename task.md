GET https://api.warframe.market/v2/orders/item/{slug}/top

这个接口会返回出售和购买订单各5个。

```Json
{
  apiVersion: "x.x.x",
  data: {
    sell: Order[],
    buy: Order[],
  },
  error: null,
}
```

```
Order
Order without specifying the owner. Used where the owner is already known, such as a user profile or your own profile.

Field	Flags	Type	Description
id		
string
Unique identifier.
type		
string
buy or sell.
platinum		
int
Total platinum currency.
quantity		
int
Number of items.
perTrade	
optional/contextual
int
Items quantity per transaction.
subtype	
optional/contextual
string
Specific subtype or category.
rank	
optional/contextual
int
Rank or level of the item.
charges	
optional/contextual
int
Number of charges left.
amberStars	
optional/contextual
int
Count of amber stars in a sculpture.
cyanStars	
optional/contextual
int
Count of cyan stars in a sculpture.
visible		
boolean
Whether the order is publicly visible.
createdAt		
string
Creation timestamp.
updatedAt		
string
Last modification timestamp.
itemId	
optional/contextual
string
Item identifier.
groupId	
optional/contextual
string
User-defined group. Default group is named all.
user	
optional/contextual
UserShort
User who created the order.
```

GET https://api.warframe.market/v1/items/{slug}/statistics

这个接口则会返回物品的订单统计数据。
```json
{
    "payload": {
        "statistics_closed": {
            "48hours": [{
                    "datetime": "2026-10-18T05:00:00.000+00:00",
                    "volume": 1,
                    "min_price": 20.0,
                    "max_price": 20.0,
                    "open_price": 20.0,
                    "closed_price": 20.0,
                    "avg_price": 20.0,
                    "wa_price": 20.0,
                    "median": 20.0,
                    "moving_avg": 20.0,
                    "donch_top": 20.0,
                    "donch_bot": 20.0,
                    "id": "6ad462e0e63ff800102f2499"
                }...],
            "90days": [{
                    "datetime": "2026-07-23T00:00:00.000+00:00",
                    "volume": 69,
                    "min_price": 17.0,
                    "max_price": 20.0,
                    "open_price": 18.0,
                    "closed_price": 20.0,
                    "avg_price": 18.5,
                    "wa_price": 19.464,
                    "median": 20.0,
                    "moving_avg": 18.6,
                    "donch_top": 22.0,
                    "donch_bot": 14.0,
                    "id": "6a62ae80baa08c00103ca26f"
                }...]
        },
        "statistics_live": {...} // 活跃订单，我们不关心
    }
}
```

任务：
给网页添加一个新的页面，展示所有集团的可出售物品，并且按照48h（默认）90days（用户可选）的销量将每个集团的物品排序展示，并且展示当前出售订单第一位的价格。

要求：
页面要符合原有的风格，并且使用户阅读友好。