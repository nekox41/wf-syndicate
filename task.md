### 任务1

我们先来修复 items.json 的数据问题，我删除了原本的 items.json,添加了新的 ExportSyndicates.json 和 items.json 数据。

第一步： 使用Python清洗ExportSyndicates，每个集团只保留name description colour backgroundColour favours

第二步： 使用Python分别读取ExportSyndicates和items，使用ExportSyndicates里面favours下的物品列表中的storeItem的最后一段（例如/Lotus/StoreItems/Types/Items/Titles/ArbitersOfHexisTitle的ArbitersOfHexisTitle）去匹配items里面的gameRef的最后一段。如果匹配到的话，将slug i18n maxRank复制到ExportSyndicates里面对应的对象身上，其中maxRank只有部分对象有，如果没有这一项的话就写0吧。另外在items里面匹配不到的对象直接删除，最后保存为真正的allitems.json

### 任务2

修正Python脚本，读取allitems.json获取数据，对于拥有maxRank（不为0）的物品，在获取当前物品出售订单的时候，要分别请求0和maxRank的数据（Query Parameters添加rank，值为数字）也就是0级和满级的数据。

在统计数据中，有等级的物品会在统计数据的具体对象中存在mod_rank属性，分别为0和maxRank这两种。没有等级的物品会不存在这个属性。

我们需要将物品的0级售价、满级售价、0级销售数据、满级销售数据加上。

### 任务3

每个集团的name属性拼接到https://browse.wf上，可以获取i18n名称。
例如：https://browse.wf/Lotus/Language/Syndicates/ArbitersName

```json
{
    "en": "Arbiters of Hexis",
    "de": "Arbiters of Hexis",
    "es": "\u00c1rbitros de Hexis",
    "fr": "Les Arbitres de Hexis",
    "it": "Arbiters of Hexis",
    "ja": "\u30a2\u30fc\u30d3\u30bf\u30fc\u30ba\u30fb\u30aa\u30d6\u30fb\u30d8\u30af\u30b7\u30b9",
    "ko": "\uc544\ube44\ud130\uc988 \uc624\ube0c \ud5e5\uc2dc\uc2a4",
    "pl": "Arbitrzy Hexis",
    "pt": "\u00c1rbitros do Hexis",
    "ru": "\u0410\u0440\u0431\u0438\u0442\u0440\u044b \u0413\u0435\u043a\u0441\u0438\u0441\u0430",
    "tc": "\u5747\u8861\u4ef2\u88c1\u8005",
    "th": "Arbiters of Hexis",
    "tr": "Arbiters of Hexis",
    "uk": "\u0410\u0440\u0431\u0456\u0442\u0440\u0438 \u0413\u0435\u043a\u0441\u0438\u0441\u0443",
    "zh": "\u5747\u8861\u4ef2\u88c1\u8005"
}
```
我们获取中文名称替换


### 任务4

我们修正网页，每个集团使用他自身的 colour 和 backgroundColour 配色。

然后添加一个开关切换物品的0级和满级数据。