/**
 * 微信读书热门划线查询脚本
 *
 * ⚠️ 警告：使用本脚本存在账号被封禁的风险！
 *
 * 风险提示：
 * - 不要频繁运行此脚本
 * - 不要设置过小的请求延迟时间
 * - 不要短时间内查询大量书籍
 * - 不要在多个设备同时使用
 * - 建议使用非主账号测试
 * - 如遇异常，立即停止使用
 *
 * 免责声明：
 * 使用本脚本产生的任何后果由使用者自行承担
 * 作者不对账号封禁等问题负责
 *
 */

const bookId = '3300024284';

async function getChapterIds() {
    try {
        const response = await fetch(
            'https://weread.qq.com/web/book/chapterInfos',
            {
                method: 'POST',
                credentials: 'include', // 包含 cookie
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({bookIds: [bookId]}),
            }
        );

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        // console.log('获取章节信息成功:', JSON.stringify(data, null, 2));

        // 从返回值的 data[0] 的 updated 的每一项的 chapterUid 取章节 ID
        if (data.data?.[0]?.updated) {
            const chapterIds = data.data[0].updated.map((item) => item.chapterUid);
            console.log(`\n总共获取 ${chapterIds.length} 个章节 ID:`, chapterIds);
            return chapterIds;
        } else {
            console.warn('返回数据结构不符合预期');
            return [];
        }
    } catch (error) {
        console.error('获取章节信息失败:', error);
        return [];
    }
}

async function getUnderlines(chapterIds) {
    if (!chapterIds || chapterIds.length === 0) {
        console.log('没有章节 ID，无法获取划线数据');
        return [];
    }

    const allUnderlines = [];

    // 遍历每个章节 ID，获取该章节的划线数据
    for (let i = 0; i < chapterIds.length; i++) {
        const uid = chapterIds[i];
        console.log(
            `\n获取第 ${i + 1}/${chapterIds.length} 个章节的划线数据 (chapterUid: ${uid})`
        );

        try {
            const response = await fetch(
                `https://weread.qq.com/web/book/underlines?bookId=${bookId}&chapterUid=${uid}`,
                {
                    method: 'GET',
                    credentials: 'include', // 包含 cookie
                }
            );

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            const underlines = data.underlines || [];
            console.log(`  获取成功，共 ${underlines.length} 条划线`);

            // 为每条划线添加对应的 chapterUid
            underlines.forEach((underline) => {
                allUnderlines.push({
                    ...underline,
                    chapterUid: uid,
                });
            });

            // 添加延迟，避免请求过快
            if (i < chapterIds.length - 1) {
                await new Promise((resolve) => setTimeout(resolve, 2000));
            }
        } catch (error) {
            console.error(`  获取第 ${i + 1} 个章节的划线数据失败:`, error);
        }
    }

    console.log(`\n总共获取 ${allUnderlines.length} 条划线`);
    return allUnderlines;
}

async function callReadReviewsInBatches(underlines, batchSize = 50) {
    if (!underlines || underlines.length === 0) {
        console.log('没有划线数据');
        return [];
    }

    console.log(`总共获取 ${underlines.length} 条划线`);

    const allAbstracts = [];

    // 分批处理
    for (let i = 0; i < underlines.length; i += batchSize) {
        const batchUnderlines = underlines.slice(i, i + batchSize);

        // 按 chapterUid 分组，因为同一个请求中的所有 range 必须来自同一个章节
        const groupedByChapter = {};
        batchUnderlines.forEach((underline) => {
            const uid = underline.chapterUid;
            if (!groupedByChapter[uid]) {
                groupedByChapter[uid] = [];
            }
            groupedByChapter[uid].push(underline);
        });

        // 为每个章节发送一个请求
        for (const [chapterUid, chapterUnderlines] of Object.entries(
            groupedByChapter
        )) {
            const reviews = chapterUnderlines.map((underline) => ({
                range: underline.range,
                maxIdx: 0,
                count: 1,
                synckey: 0,
            }));

            const payload = {
                bookId,
                chapterUid: parseInt(chapterUid),
                reviews,
            };

            console.log(
                `\n处理第 ${Math.floor(i / batchSize) + 1} 批，chapterUid: ${chapterUid}，共 ${reviews.length} 条划线`
            );
            console.log('请求参数:', JSON.stringify(payload, null, 2));

            try {
                const response = await fetch(
                    'https://weread.qq.com/web/book/readReviews',
                    {
                        method: 'POST',
                        credentials: 'include', // 包含 cookie
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify(payload),
                    }
                );

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const result = await response.json();

                // 从返回结果中提取 abstract 字段
                if (result.reviews && Array.isArray(result.reviews)) {
                    result.reviews.forEach((review) => {
                        if (
                            review.pageReviews &&
                            Array.isArray(review.pageReviews) &&
                            review.pageReviews.length > 0
                        ) {
                            const firstPageReview = review.pageReviews[0];
                            if (firstPageReview.review?.abstract) {
                                allAbstracts.push([firstPageReview.review.chapterTitle, firstPageReview.review.abstract]);
                            }
                        }
                    });
                }
            } catch (error) {
                console.error(`处理 chapterUid: ${chapterUid} 的请求失败:`, error);
            }

            // 添加延迟，避免请求过快
            await new Promise((resolve) => setTimeout(resolve, 3000));
        }
    }

    console.log(`\n总共提取 ${allAbstracts.length} 条 abstract`);
    console.log('所有 abstract 内容:', JSON.stringify(allAbstracts, null, 2));
    return allAbstracts;
}

/**
 * 主函数
 */
async function main() {
    console.log('开始获取微信读书数据...\n');

    // 先获取所有章节 ID
    console.log('=== 第一步：获取书籍的全部章节 ID ===');
    const chapterIds = await getChapterIds();

    console.log('\n=== 第二步：获取划线数据 ===');
    const underlines = await getUnderlines(chapterIds);

    console.log('\n=== 第三步：批量获取评论 ===');
    const abstracts = await callReadReviewsInBatches(underlines, 50);

    console.log('\n所有请求完成！');
    console.log(`\n最终结果：共获取 ${abstracts.length} 条 abstract`);
    console.log(abstracts);
    return abstracts;
}

// 执行主函数
main().catch(console.error);


